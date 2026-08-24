import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMove, initGame } from "./moves.js";
import { countingHandSize, handCapacity, populationMax, robotMax } from "./state.js";
import type { GameState, PlayerState } from "./types.js";

function activePlayer(state: GameState): PlayerState {
	return state.players[state.activeSeat] as PlayerState;
}

test("buy factory: water factory costs 20, joins unmanned", () => {
	const state = initGame(3, {}, "buy-spec");
	const player = activePlayer(state);
	player.hand = [
		{ t: "water", v: 10 },
		{ t: "water", v: 10 },
	];
	applyMove(
		state,
		{ action: "endTurn", buys: [{ buy: "factory", factory: "water", cards: [0, 1] }], manned: [] },
		state.activeSeat
	);
	assert.equal(player.factories.length, 4);
	assert.equal(player.factories.at(-1)?.type, "water");
	assert.equal(player.factories.at(-1)?.manned, false);
	assert.equal(player.hand.length, 0);
	// Spent cards go to the face-up discard pile.
	assert.equal(state.discards.water.length, 2);
});

test("buy factory: titanium requires heavy equipment, research requires laboratory", () => {
	const state = initGame(3, {}, "buy-spec2");
	const player = activePlayer(state);
	player.hand = [{ t: "water", v: 40 }];
	const buyIn = (factory: "titanium" | "research") =>
		({ action: "endTurn", buys: [{ buy: "factory", factory, cards: [0] }], manned: [] }) as const;
	assert.throws(() => applyMove(state, buyIn("titanium"), state.activeSeat));
	assert.throws(() => applyMove(state, buyIn("research"), state.activeSeat));
	player.upgrades.heavyEquipment = 1;
	applyMove(state, buyIn("titanium"), state.activeSeat);
	assert.equal(player.factories.at(-1)?.type, "titanium");
});

test("buy factory: new chemicals requires a research card in the payment", () => {
	const state = initGame(3, {}, "buy-spec3");
	const player = activePlayer(state);
	player.hand = [{ t: "water", v: 60 }];
	assert.throws(() =>
		applyMove(
			state,
			{ action: "endTurn", buys: [{ buy: "factory", factory: "newChemicals", cards: [0] }], manned: [] },
			state.activeSeat
		)
	);
	player.hand = [
		{ t: "water", v: 50 },
		{ t: "research", v: 12 },
	];
	applyMove(
		state,
		{ action: "endTurn", buys: [{ buy: "factory", factory: "newChemicals", cards: [0, 1] }], manned: [] },
		state.activeSeat
	);
	assert.equal(player.factories.at(-1)?.type, "newChemicals");
});

test("population: costs 10 (5 with ecoplants), capped by population max", () => {
	const state = initGame(3, {}, "pop-spec");
	const player = activePlayer(state);
	player.hand = [
		{ t: "water", v: 10 },
		{ t: "water", v: 10 },
		{ t: "water", v: 10 },
	];
	assert.equal(populationMax(player), 5);
	// Over the cap (3 + 3 > 5) rejected atomically: nothing spent.
	assert.throws(() =>
		applyMove(
			state,
			{ action: "endTurn", buys: [{ buy: "population", count: 3, cards: [0, 1, 2] }], manned: [] },
			state.activeSeat
		)
	);
	assert.equal(player.population, 3);
	assert.equal(player.hand.length, 3);
	player.upgrades.ecoplants = 1;
	player.upgrades.nodule = 1;
	assert.equal(populationMax(player), 8);
	// With ecoplants a colonist costs 5: two for one card, one more for another.
	applyMove(
		state,
		{
			action: "endTurn",
			buys: [
				{ buy: "population", count: 2, cards: [0] },
				{ buy: "population", count: 1, cards: [0] },
			],
			manned: [],
		},
		state.activeSeat
	);
	assert.equal(player.population, 6);
	assert.equal(player.hand.length, 1);
});

test("robots: require the upgrade and respect the robot limit", () => {
	const state = initGame(3, {}, "robot-spec");
	const player = activePlayer(state);
	player.hand = [
		{ t: "water", v: 10 },
		{ t: "water", v: 10 },
	];
	const buyRobot = { action: "endTurn", buys: [{ buy: "robots", count: 1, cards: [0] }], manned: [] } as const;
	assert.throws(() => applyMove(state, buyRobot, state.activeSeat));
	player.upgrades.robots = 1;
	assert.equal(robotMax(player), player.population);
	applyMove(state, buyRobot, state.activeSeat);
	assert.equal(player.robots, 1);
});

test("end turn: buys apply in order and manning covers factories bought this turn", () => {
	const state = initGame(3, {}, "turn-buys-spec");
	const player = activePlayer(state);
	player.hand = [
		{ t: "water", v: 10 },
		{ t: "water", v: 10 },
		{ t: "water", v: 10 },
	];
	// Buy a water factory (20, two cards) then a colonist (10, the remaining
	// card, now at index 0), and man the new factory (index 3).
	applyMove(
		state,
		{
			action: "endTurn",
			buys: [
				{ buy: "factory", factory: "water", cards: [0, 1] },
				{ buy: "population", count: 1, cards: [0] },
			],
			manned: [0, 1, 2, 3],
		},
		state.activeSeat
	);
	assert.equal(player.factories.length, 4);
	assert.equal(player.population, 4);
	assert.equal(player.hand.length, 0);
	assert.equal(player.factories[3]?.manned, true);
	const logged = state.log.at(-1);
	assert.ok(logged?.type === "move" && logged.info?.paid === 30);
});

test("end turn: an illegal later step rejects the whole move without mutating", () => {
	const state = initGame(3, {}, "turn-atomic-spec");
	const player = activePlayer(state);
	player.hand = [
		{ t: "water", v: 10 },
		{ t: "water", v: 10 },
	];
	const snapshot = JSON.stringify(state);
	// First buy is legal on its own; the second (robots without the upgrade) is not.
	assert.throws(() =>
		applyMove(
			state,
			{
				action: "endTurn",
				buys: [
					{ buy: "factory", factory: "water", cards: [0, 1] },
					{ buy: "robots", count: 1, cards: [0] },
				],
				manned: [],
			},
			state.activeSeat
		)
	);
	assert.equal(JSON.stringify(state), snapshot);
});

test("end turn: mans the selected factories and passes the action turn on", () => {
	const state = initGame(3, {}, "turn-spec");
	const first = state.activeSeat;
	const player = activePlayer(state);
	applyMove(state, { action: "endTurn", buys: [], manned: [0, 2] }, first);
	assert.equal(player.factories[0]?.manned, true);
	assert.equal(player.factories[1]?.manned, false);
	assert.equal(player.factories[2]?.manned, true);
	assert.ok(state.activeSeat !== first);
	assert.throws(() => applyMove(state, { action: "endTurn", buys: [], manned: [] }, first));
});

test("end turn: cannot man more factories than operators", () => {
	const state = initGame(3, {}, "turn-spec2");
	const player = activePlayer(state);
	player.factories.push({ type: "ore", manned: false });
	player.factories.push({ type: "ore", manned: false });
	assert.throws(() => applyMove(state, { action: "endTurn", buys: [], manned: [0, 1, 2, 3, 4] }, state.activeSeat));
});

test("discard phase: over-capacity players must discard down to the cap", () => {
	const state = initGame(3, {}, "discard-spec");
	// Complete round 1 with everyone hoarding; force a big hand on player 0.
	const hoarder = state.players[0] as PlayerState;
	hoarder.hand = Array.from({ length: 13 }, () => ({ t: "ore" as const, v: 1 }));
	hoarder.hand.push({ t: "research", v: 9 }); // exempt from the cap
	for (let guard = 0; guard < 10 && state.round === 1; guard++) {
		applyMove(state, { action: "endTurn", buys: [], manned: [0, 1, 2] }, state.activeSeat);
	}
	assert.equal(state.round, 2);
	assert.equal(state.phase, "discard");
	assert.ok(hoarder.mustDiscard);
	assert.ok(countingHandSize(hoarder) > handCapacity(hoarder));
	// Not enough discards rejected.
	assert.throws(() => applyMove(state, { action: "discard", cards: [0] }, 0));
	const excess = countingHandSize(hoarder) - handCapacity(hoarder);
	applyMove(state, { action: "discard", cards: Array.from({ length: excess }, (_, i) => i) }, 0);
	assert.equal(hoarder.mustDiscard, false);
	assert.equal(state.phase, "actions");
});

test("hardening: malformed moves are rejected without mutating state", () => {
	const state = initGame(3, {}, "hardening-spec");
	const snapshot = JSON.stringify(state);
	const seat = state.activeSeat;
	assert.throws(() => applyMove(state, null as never, seat));
	assert.throws(() => applyMove(state, "endTurn" as never, seat));
	assert.throws(() => applyMove(state, [] as never, seat));
	assert.throws(() => applyMove(state, { action: "unknown" } as never, seat));
	const turn = (buys: unknown) => ({ action: "endTurn", buys, manned: [] }) as never;
	assert.throws(() => applyMove(state, turn("everything"), seat));
	assert.throws(() => applyMove(state, turn([{ buy: "spaceElevator", cards: [] }]), seat));
	assert.throws(() => applyMove(state, turn([{ buy: "factory", factory: "moon", cards: [] }]), seat));
	assert.throws(() => applyMove(state, turn([{ buy: "population", count: 1, cards: [99] }]), seat));
	assert.throws(() => applyMove(state, turn([{ buy: "population", count: 1, cards: [0, 0] }]), seat));
	assert.throws(() => applyMove(state, turn([{ buy: "population", count: 1.5, cards: [0] }]), seat));
	assert.throws(() => applyMove(state, turn([{ buy: "population", count: 1, cards: [0.5] }]), seat));
	assert.throws(() =>
		applyMove(state, turn(Array.from({ length: 51 }, () => ({ buy: "population", count: 1, cards: [0] }))), seat)
	);
	assert.throws(() => applyMove(state, { action: "bid", amount: Infinity } as never, seat));
	assert.throws(() => applyMove(state, { action: "bid", amount: "9" } as never, seat));
	assert.throws(() => applyMove(state, { action: "endTurn", buys: [], manned: "all" } as never, seat));
	assert.throws(() => applyMove(state, { action: "endTurn", buys: [], manned: [0] } as never, seat + 1));
	assert.throws(() => applyMove(state, { action: "endTurn", buys: [], manned: [0] } as never, "0" as never));
	assert.throws(() =>
		applyMove(state, { action: "discard", cards: Array.from({ length: 10_000 }, (_, i) => i) } as never, seat)
	);
	assert.equal(JSON.stringify(state), snapshot);
});

test("hardening: extra keys and __proto__ payloads are stripped before logging", () => {
	const state = initGame(3, {}, "hardening-spec2");
	const seat = state.activeSeat;
	const malicious = JSON.parse(
		'{"action":"endTurn","buys":[],"manned":[0,1,2],"__proto__":{"polluted":true},"junk":"x","nested":{"a":1}}'
	) as never;
	applyMove(state, malicious, seat);
	const logged = state.log.at(-1);
	assert.ok(logged?.type === "move");
	assert.deepEqual(logged.move, { action: "endTurn", buys: [], manned: [0, 1, 2] });
	assert.equal(({} as { polluted?: boolean }).polluted, undefined);
	// The logged move is a fresh literal, not the network object.
	assert.notEqual(logged.move, malicious);
});
