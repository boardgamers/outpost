import assert from "node:assert/strict";
import { test } from "node:test";
import { moveAI } from "./ai.js";
import { applyMove, initGame } from "./moves.js";
import { replay } from "./replay.js";
import * as wrapper from "../wrapper.js";
import type { GameState } from "./types.js";

function play(state: GameState, moves: number): GameState {
	for (let i = 0; i < moves && !state.ended; i++) {
		const current = wrapper.currentPlayer(state);
		const seat = Array.isArray(current) ? current[0] : current;
		moveAI(state, seat as number);
	}
	return state;
}

test("wrapper: init/currentPlayer/scores/logLength contract", async () => {
	const state = await wrapper.init(4, [], {}, "wrapper-spec");
	assert.equal(state.players.length, 4);
	assert.equal(typeof wrapper.currentPlayer(state), "number");
	assert.deepEqual(wrapper.scores(state), [3, 3, 3, 3]);
	assert.ok(wrapper.logLength(state) >= 2); // init + round 1
	assert.equal(wrapper.ended(state), false);
	assert.equal(wrapper.round(state), 1);
});

test("stripSecret hides seed, deck values and other players' hand values", () => {
	const state = play(initGame(3, {}, "strip-spec"), 30);
	const stripped = wrapper.stripSecret(state, 0);
	assert.equal(stripped.seed, "");
	assert.ok(Object.values(stripped.decks).every((deck) => deck.every((v) => v === -1)));
	assert.deepEqual(stripped.players[0]?.hand, state.players[0]?.hand);
	for (const seat of [1, 2]) {
		assert.ok(stripped.players[seat]?.hand.every((c) => c.v === -1));
		assert.equal(stripped.players[seat]?.hand.length, state.players[seat]?.hand.length);
	}
	const initEntry = stripped.log[0];
	assert.ok(initEntry?.type === "init" && initEntry.seed === "");
	for (const entry of stripped.log) {
		if (entry.type === "round") {
			for (const { player, cards } of entry.produced) {
				if (player !== 0) {
					assert.ok(cards.every((c) => c.v === -1));
				}
			}
		}
	}
	// stripSecret must not mutate the source state.
	assert.notEqual(state.seed, "");
});

test("stripped state stays JSON-round-trippable", () => {
	const state = play(initGame(3, {}, "json-spec"), 50);
	const stripped = wrapper.stripSecret(state, 1);
	assert.deepEqual(JSON.parse(JSON.stringify(stripped)), stripped);
});

test("replay rebuilds the same public state from the log", () => {
	const state = play(initGame(3, {}, "replay-spec"), 200);
	const replayed = replay(state);
	assert.equal(replayed.round, state.round);
	assert.equal(replayed.moveCount, state.moveCount);
	assert.deepEqual(wrapper.scores(replayed), wrapper.scores(state));
	replayed.players.forEach((player, seat) => {
		assert.deepEqual(player.hand, state.players[seat]?.hand);
		assert.deepEqual(player.factories, state.players[seat]?.factories);
		assert.deepEqual(player.upgrades, state.players[seat]?.upgrades);
	});
	assert.deepEqual(replayed.market, state.market);
});

test("replay of a stripped state yields a stripped state", () => {
	const state = play(initGame(3, {}, "replay-strip-spec"), 100);
	const stripped = wrapper.stripSecret(state, 0);
	const replayed = replay(stripped);
	assert.equal(replayed.round, stripped.round);
	assert.deepEqual(replayed.players[0]?.hand, stripped.players[0]?.hand);
	assert.ok(replayed.players[1]?.hand.every((c) => c.v === -1));
});

test("replay to a mid-game point stops there", () => {
	const state = play(initGame(3, {}, "replay-to-spec"), 60);
	const partial = replay(state, { to: 10 });
	assert.ok(partial.moveCount < state.moveCount);
});

test("dropPlayer removes the player from play and can end the game", async () => {
	const state = play(initGame(3, {}, "drop-spec"), 20);
	await wrapper.dropPlayer(state, state.activeSeat);
	assert.ok(!state.purchaseOrder.includes(state.players.findIndex((p) => p.dropped)));
	await wrapper.dropPlayer(
		state,
		state.players.findIndex((p) => !p.dropped)
	);
	assert.ok(state.ended);
	const ranks = wrapper.rankings(state);
	assert.equal(ranks.length, 3);
});

test("toSave persists every state (the platform has no memory between moves)", () => {
	const state = initGame(3, {}, "tosave-spec");
	for (const p of state.players) {
		p.hand = [
			{ t: "water", v: 10 },
			{ t: "water", v: 10 },
			{ t: "water", v: 10 },
			{ t: "water", v: 10 },
			{ t: "water", v: 10 },
			{ t: "water", v: 10 },
		];
	}
	// Every move must be saved: bids come from different seats, and drops or
	// settings changes also persist through toSave.
	const opener = state.activeSeat;
	applyMove(state, { action: "auction", marketIndex: 0, bid: 25 }, opener);
	assert.equal(wrapper.toSave(state), state);
	const bidder = state.auction?.activeBidder as number;
	applyMove(state, { action: "bid", amount: 30 }, bidder);
	assert.equal(wrapper.toSave(state), state);
	let guard = 0;
	while (state.phase === "auction" && guard++ < 20) {
		applyMove(state, { action: "bidPass" }, state.auction?.activeBidder as number);
	}
	assert.equal(state.phase, "auctionPayment");
	assert.equal(wrapper.toSave(state), state);
});

test("toSave persists a finished game", () => {
	const state = play(initGame(4, {}, "tosave-end"), 100000);
	assert.ok(state.ended);
	assert.equal(wrapper.toSave(state), state);
});

test("messages drain once", () => {
	const state = play(initGame(4, {}, "messages-spec"), 500);
	const first = wrapper.messages(state);
	assert.deepEqual(wrapper.messages(state).messages, []);
	assert.ok(Array.isArray(first.messages));
});

test("messages only carry major events: auction wins and game end", () => {
	const state = play(initGame(4, {}, "messages-major"), 100000);
	assert.ok(state.ended);
	const all = wrapper.messages(state).messages;
	assert.ok(all.length > 0);
	for (const message of all) {
		assert.ok(message.startsWith("Game over:") || / won .+ for \d+$/.test(message), `unexpected: ${message}`);
	}
	assert.ok(all.some((m) => m.startsWith("Game over:")));
});
