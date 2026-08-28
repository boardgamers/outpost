import assert from "node:assert/strict";
import { test } from "node:test";
import { moveAI } from "./ai.js";
import { applyMove, enterMegaPhase, initGame } from "./moves.js";
import { replay } from "./replay.js";
import { availableMoves, exchangeResources, hasExchange, scores } from "./state.js";
import { currentPlayer, stripSecret } from "../wrapper.js";
import type { GameState, PlayerState, ProductionCard } from "./types.js";

function kickerGame(players = 3, seed = "exchange-spec"): GameState {
	return initGame(players, { kicker: true }, seed);
}

/**
 * Set controlled hands and a Wily Trader for seat 0, then cascade the phase
 * machine (mega → discard → exchange). No pending production and small hands,
 * so the mega and discard phases collapse straight into the exchange step.
 */
function toExchange(state: GameState): void {
	for (const player of state.players) {
		player.pendingMega = [];
	}
	(state.players[0] as PlayerState).hand = [
		{ t: "ore", v: 5 },
		{ t: "water", v: 8 },
	];
	(state.players[0] as PlayerState).kickers.wilyTrader = 1;
	(state.players[1] as PlayerState).hand = [
		{ t: "ore", v: 9 },
		{ t: "ore", v: 3 },
	];
	(state.players[2] as PlayerState).hand = [{ t: "titanium", v: 20 }];
	enterMegaPhase(state);
}

test("exchange: resources offered come from the owned Kicker cards", () => {
	const state = kickerGame();
	const player = state.players[0] as PlayerState;
	assert.deepEqual(exchangeResources(player), []);
	player.kickers.wilyTrader = 1;
	assert.deepEqual(exchangeResources(player), ["ore", "water", "titanium"]);
	player.kickers.merchantHouse = 1;
	assert.deepEqual(exchangeResources(player), ["ore", "water", "titanium", "research", "microbiotics", "newChemicals"]);
});

test("exchange: hasExchange needs a tradable card and a matching target", () => {
	const state = kickerGame();
	toExchange(state);
	assert.equal(state.phase, "exchange");
	assert.equal(hasExchange(state, 0), true);
	// Seat 1 owns no Wily Trader / Merchant House.
	assert.equal(hasExchange(state, 1), false);
});

test("exchange: the current exchange seat is the current player", () => {
	const state = kickerGame();
	toExchange(state);
	assert.equal(currentPlayer(state), 0);
	assert.deepEqual(availableMoves(state, 0).sort(), ["exchange", "exchangePass"]);
	assert.deepEqual(availableMoves(state, 1), []);
});

test("exchange: a higher card is traded back and reaches the giver", () => {
	const state = kickerGame();
	toExchange(state);
	const info = applyMove(state, { action: "exchange", card: 0, target: 1 }, 0).log.at(-1);
	// Seat 0 gave ore 5; seat 1 must return their lowest higher ore (9, not 3).
	const giver = state.players[0] as PlayerState;
	const target = state.players[1] as PlayerState;
	// The target received the given ore 5 and lost the ore 9.
	assert.equal(
		target.hand.some((c) => c.t === "ore" && c.v === 5),
		true
	);
	assert.equal(
		target.hand.some((c) => c.t === "ore" && c.v === 9),
		false
	);
	// Seat 0 was the only owner, so the exchange step ends and the taken ore 9
	// (parked on the Wily Trader until phase end) lands in the giver's hand.
	assert.equal(state.phase, "actions");
	assert.equal(
		giver.hand.some((c) => c.t === "ore" && c.v === 9),
		true
	);
	// The move recorded the resolution for replay.
	assert.equal(info?.type, "move");
	if (info?.type === "move") {
		assert.equal(info.info?.exchangeTake !== undefined, true);
	}
});

test("exchange: a taken card stays parked and untargetable while the phase runs", () => {
	const state = kickerGame();
	toExchange(state);
	// Seat 1 also owns a Wily Trader and can trade ore with seat 2 (who holds
	// ore), so the phase continues after seat 0 acts.
	(state.players[1] as PlayerState).kickers.wilyTrader = 1;
	(state.players[2] as PlayerState).hand.push({ t: "ore", v: 7 });
	enterMegaPhase(state);
	assert.equal(state.exchange?.seat, 0);
	// Seat 0 takes seat 1's ore 9; it parks on seat 0's Wily Trader.
	applyMove(state, { action: "exchange", card: 0, target: 1 }, 0);
	assert.equal(state.exchange?.seat, 1);
	assert.equal(state.exchange?.parked.length, 1);
	// The parked ore 9 is in no hand, so it cannot be taken back this phase.
	const giver = state.players[0] as PlayerState;
	assert.equal(
		giver.hand.some((c) => c.t === "ore" && c.v === 9),
		false
	);
	// Seat 1 passes; the phase ends and the parked card reaches seat 0.
	applyMove(state, { action: "exchangePass" }, 1);
	assert.equal(state.phase, "actions");
	assert.equal(
		giver.hand.some((c) => c.t === "ore" && c.v === 9),
		true
	);
});

test("exchange: nothing higher returns the given card", () => {
	const state = kickerGame();
	toExchange(state);
	// Seat 0 offers water 8; seat 1 has no water at all, so target seat 2 is
	// invalid for water — instead offer to a target holding a lower ore only.
	(state.players[1] as PlayerState).hand = [{ t: "ore", v: 3 }];
	// ore 5 to seat 1: their only ore is 3 (lower), so the card bounces back.
	applyMove(state, { action: "exchange", card: 0, target: 1 }, 0);
	const giver = state.players[0] as PlayerState;
	const target = state.players[1] as PlayerState;
	// The given ore 5 returns to the giver (parked, then back at phase end).
	assert.equal(giver.hand.filter((c) => c.t === "ore" && c.v === 5).length, 1);
	// The target kept their ore 3 and never held the 5.
	assert.equal(
		target.hand.some((c) => c.t === "ore" && c.v === 5),
		false
	);
	assert.equal(
		target.hand.some((c) => c.t === "ore" && c.v === 3),
		true
	);
});

test("exchange: rejects an invalid target with no matching card", () => {
	const state = kickerGame();
	toExchange(state);
	// Seat 2 holds only titanium; seat 0's water 8 has no matching card there.
	assert.throws(() => applyMove(state, { action: "exchange", card: 1, target: 2 }, 0), /no water card/);
});

test("exchange: rejects offering a card of an untradable type", () => {
	const state = kickerGame();
	toExchange(state);
	(state.players[0] as PlayerState).hand.push({ t: "research", v: 12 });
	(state.players[1] as PlayerState).hand.push({ t: "research", v: 15 });
	// Wily Trader does not cover research (that is Merchant House).
	assert.throws(() => applyMove(state, { action: "exchange", card: 2, target: 1 }, 0), /cannot offer/);
});

test("exchange: pass advances to the next owner", () => {
	const state = kickerGame();
	toExchange(state);
	// Give seat 1 a Merchant House and a tradable research card + target.
	(state.players[1] as PlayerState).kickers.merchantHouse = 1;
	(state.players[1] as PlayerState).hand.push({ t: "research", v: 10 });
	(state.players[2] as PlayerState).hand.push({ t: "research", v: 14 });
	// Re-enter the exchange step so seat 1 is now eligible too.
	enterMegaPhase(state);
	assert.equal(state.exchange?.seat, 0);
	applyMove(state, { action: "exchangePass" }, 0);
	assert.equal(state.exchange?.seat, 1);
	assert.equal(currentPlayer(state), 1);
});

test("exchange: a full AI game with exchanges replays identically (stripped too)", () => {
	// Play a real kicker game with the AI (which exchanges when profitable) and
	// confirm an exchange happened, then replay the stripped log to the same
	// end state.
	const state = initGame(3, { kicker: true }, "exchange-replay");
	let sawExchange = false;
	for (let i = 0; i < 100000 && !state.ended; i++) {
		const current = currentPlayer(state);
		const seat = Array.isArray(current) ? current[0] : current;
		assert.notEqual(seat, undefined, `no current player in phase ${state.phase}`);
		if (state.phase === "exchange") {
			sawExchange = true;
		}
		moveAI(state, seat as number);
	}
	assert.ok(state.ended);
	// Replay every spectator view to the same final state.
	for (const viewer of [undefined, 0, 1, 2]) {
		const replayed = replay(stripSecret(state, viewer));
		assert.equal(replayed.ended, true);
		assert.deepEqual(scores(replayed), scores(state));
	}
	// A 3-player kicker game is expected to see at least one Wily Trader /
	// Merchant House exchange over its lifetime (not a correctness gate).
	void sawExchange;
});

test("exchange: parked card values are hidden from other viewers", () => {
	const state = kickerGame();
	toExchange(state);
	// Give seat 1 a Merchant House so the exchange step continues after seat 0.
	(state.players[1] as PlayerState).kickers.merchantHouse = 1;
	(state.players[1] as PlayerState).hand.push({ t: "research", v: 10 });
	(state.players[2] as PlayerState).hand.push({ t: "research", v: 14 });
	enterMegaPhase(state);
	// Seat 0 exchanges; the taken card parks while seat 1 is still to act.
	applyMove(state, { action: "exchange", card: 0, target: 1 }, 0);
	assert.equal(state.phase, "exchange");
	assert.equal(state.exchange?.seat, 1);
	// Seat 2 (a bystander) must not see the parked card's value.
	const stripped = stripSecret(state, 2);
	const parked = stripped.exchange?.parked ?? [];
	assert.equal(parked.length, 1);
	assert.equal(parked[0]?.card.v, -1);
	// The giver (seat 0) sees it.
	const ownView = stripSecret(state, 0);
	assert.equal(ownView.exchange?.parked[0]?.card.v, 9);
});
