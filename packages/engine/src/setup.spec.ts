import assert from "node:assert/strict";
import { test } from "node:test";
import { PRODUCTION_DECKS, SETUP_CHART } from "./data.js";
import { applyMove, initGame } from "./moves.js";
import { replay } from "./replay.js";
import { handCapacity, populationMax, scores, setup, victoryPoints } from "./state.js";
import { RESOURCES } from "./types.js";

test("setup gives each player 2 ore + 1 water, 3 population, all manned", () => {
	const state = setup(4, {}, "seed");
	for (const player of state.players) {
		assert.equal(player.factories.length, 3);
		assert.deepEqual(player.factories.map((f) => f.type).sort(), ["ore", "ore", "water"]);
		assert.ok(player.factories.every((f) => f.manned));
		assert.equal(player.population, 3);
		assert.equal(player.robots, 0);
		assert.equal(handCapacity(player), 10);
		assert.equal(populationMax(player), 5);
		assert.equal(victoryPoints(player), 3);
	}
});

test("decks match the documented distributions and averages", () => {
	const state = setup(4, {}, "seed");
	for (const resource of RESOURCES) {
		const spec = PRODUCTION_DECKS[resource];
		const expectedSize = Object.values(spec.distribution).reduce((a, b) => a + b, 0);
		const deck = state.decks[resource];
		assert.equal(deck.length, expectedSize, `${resource} deck size`);
		const average = deck.reduce((a, b) => a + b, 0) / deck.length;
		assert.equal(average, spec.average, `${resource} average`);
	}
});

test("supply follows the expert setup chart", () => {
	const state = setup(5, {}, "seed");
	assert.equal(state.supply.dataLibrary, SETUP_CHART[5]?.firstTen);
	assert.equal(state.supply.moonBase, SETUP_CHART[5]?.lastThree);
});

test("two-player supply is randomized to 1-2 copies per type with 4-10 pairs", () => {
	const state = setup(2, {}, "seed");
	const counts = Object.values(state.supply);
	assert.ok(counts.every((c) => c === 1 || c === 2));
	const pairs = counts.filter((c) => c === 2).length;
	assert.ok(pairs >= 4 && pairs <= 10, `pairs=${pairs}`);
});

test("initGame starts with four ore and two water cards, ready for player turns", () => {
	const state = initGame(3, {}, "seed");
	assert.equal(state.round, 1);
	for (const player of state.players) {
		assert.deepEqual(
			player.hand.map((card) => card.t),
			["ore", "ore", "ore", "ore", "water", "water"]
		);
	}
	// Round 1: nobody over cap, so straight to actions in purchase order.
	assert.equal(state.phase, "actions");
	assert.equal(state.market.length, 3);
	// Only d4 upgrades before anyone reaches 10 VP.
	for (const upgrade of state.market) {
		assert.ok(["dataLibrary", "warehouse", "heavyEquipment", "nodule"].includes(upgrade));
	}
	assert.deepEqual(scores(state), [3, 3, 3]);
});

for (const count of [2, 3, 4, 5, 6, 7, 8, 9]) {
	for (const kicker of [false, true]) {
		test(`starting hands use the decks and replay correctly for ${count} players, kicker=${kicker}`, () => {
			const state = initGame(count, { kicker }, "starting-hands");
			assert.equal(state.phase, "actions");
			for (const player of state.players) {
				assert.deepEqual(
					player.hand.map((card) => card.t),
					["ore", "ore", "ore", "ore", "water", "water"]
				);
				assert.deepEqual(player.pendingMega, []);
			}
			for (const resource of ["ore", "water"] as const) {
				const cards = [
					...state.decks[resource],
					...state.players.flatMap((player) => player.hand.filter((card) => card.t === resource).map((card) => card.v)),
				];
				for (const [value, expected] of Object.entries(PRODUCTION_DECKS[resource].distribution)) {
					assert.equal(cards.filter((card) => card === Number(value)).length, expected);
				}
			}
			assert.deepEqual(
				replay(state).players.map((p) => p.hand),
				state.players.map((p) => p.hand)
			);
		});
	}
}

test("the second round produces only one card per operated factory", () => {
	const state = initGame(3, {}, "second-round-production");
	for (const seat of [...state.purchaseOrder]) {
		applyMove(state, { action: "endTurn", buys: [], manned: [0, 1, 2] }, seat);
	}
	assert.equal(state.round, 2);
	for (const player of state.players) {
		assert.equal(player.hand.filter((card) => card.t === "ore").length, 6);
		assert.equal(player.hand.filter((card) => card.t === "water").length, 3);
	}
});

test("old saved games retain their recorded three-card opening when replayed and continued", () => {
	const saved = initGame(3, {}, "legacy-opening");
	const firstRound = saved.log.find((entry) => entry.type === "round");
	assert.ok(firstRound && firstRound.type === "round");
	for (const produced of firstRound.produced) {
		produced.cards = produced.cards.filter((_, index) => index === 0 || index === 1 || index === 4);
	}
	const state = replay(saved);
	for (const player of state.players) {
		assert.deepEqual(
			player.hand.map((card) => card.t),
			["ore", "ore", "water"]
		);
	}
	for (const seat of [...state.purchaseOrder]) {
		applyMove(state, { action: "endTurn", buys: [], manned: [0, 1, 2] }, seat);
	}
	assert.equal(state.round, 2);
	for (const player of state.players) {
		assert.equal(player.hand.length, 6);
	}
});

test("player count is validated", () => {
	assert.throws(() => setup(1, {}, "s"));
	assert.throws(() => setup(11, {}, "s"));
	assert.throws(() => setup(2.5, {}, "s"));
});

test("setup is deterministic per seed", () => {
	const a = initGame(4, {}, "abc");
	const b = initGame(4, {}, "abc");
	assert.deepEqual(a, b);
	const c = initGame(4, {}, "xyz");
	assert.notDeepEqual(a.decks, c.decks);
});
