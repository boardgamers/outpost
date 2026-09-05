import assert from "node:assert/strict";
import { test } from "node:test";
import { PRODUCTION_DECKS } from "./data.js";
import { applyMove, initGame } from "./moves.js";
import { producePlayer } from "./production.js";
import { drawCard } from "./state.js";
import type { GameState, PlayerState } from "./types.js";

/** Empty every ore card out of deck and discard (all "held in hands"). */
function drainOre(state: GameState): void {
	state.decks.ore = [];
	state.discards.ore = [];
}

test("dry deck: an empty deck reshuffles its discard pile", () => {
	const state = initGame(3, {}, "dry-reshuffle");
	state.decks.ore = [];
	state.discards.ore = [2, 4];
	const drawn = [drawCard(state, "ore"), drawCard(state, "ore")];
	assert.deepEqual(
		drawn.sort((a, b) => a - b),
		[2, 4]
	);
	assert.equal(state.decks.ore.length, 0);
	assert.equal(state.discards.ore.length, 0);
});

test("dry deck: deck and discard empty produces a stand-in at the deck average", () => {
	const state = initGame(3, {}, "dry-average");
	drainOre(state);
	assert.equal(drawCard(state, "ore"), PRODUCTION_DECKS.ore.average);
});

test("dry deck: the stand-in is a real card — it spends and re-enters the discard pile", () => {
	const state = initGame(3, {}, "dry-persists");
	drainOre(state);
	const player = state.players[0] as PlayerState;
	player.hand = [];
	const produced = producePlayer(state, player);
	// 2 ore + 1 water factories: the 2 ore draws come from thin air, the water
	// draw from the real deck.
	assert.deepEqual(
		produced.filter((c) => c.t === "ore").map((c) => c.v),
		[3, 3]
	);
	player.hand.push(...produced);
	player.pendingMega = [];

	// Discard both stand-ins: the discard pile now holds the paper cards.
	player.mustDiscard = true;
	state.phase = "discard";
	const oreIndices = player.hand.flatMap((c, i) => (c.t === "ore" ? [i] : []));
	applyMove(state, { action: "discard", cards: oreIndices }, 0);
	assert.deepEqual([...state.discards.ore].sort(), [3, 3]);

	// A later dry draw reshuffles them back into a real deck: the stand-ins
	// permanently join circulation.
	state.decks.ore = [];
	assert.equal(drawCard(state, "ore"), 3);
	assert.equal(state.decks.ore.length, 1);
});
