import assert from "node:assert/strict";
import { test } from "node:test";
import { MEGA_CARDS } from "./data.js";
import { applyMove, initGame } from "./moves.js";
import { replay } from "./replay.js";
import { countingHandSize, handValue, megaEligible } from "./state.js";
import { currentPlayer, stripSecret } from "../wrapper.js";
import type { GameState, PlayerState, ProductionCard } from "./types.js";

/** A game where seat 0 just produced 5 water draws (1 mega group + 1 single). */
function megaGame(): GameState {
	const state = initGame(3, {}, "mega-spec");
	const player = state.players[0] as PlayerState;
	// Forge seat 0's production: 5 water + 1 ore (water is mega-eligible). Write
	// it into the round entry too, so a replay reproduces the staged draws.
	const produced: ProductionCard[] = [
		{ t: "water", v: 6 },
		{ t: "water", v: 7 },
		{ t: "water", v: 8 },
		{ t: "water", v: 9 },
		{ t: "water", v: 5 },
		{ t: "ore", v: 3 },
	];
	const roundEntry = state.log.find((e) => e.type === "round");
	if (roundEntry && roundEntry.type === "round") {
		const rec = roundEntry.produced.find((r) => r.player === 0);
		if (rec) {
			rec.cards = produced.map((c) => ({ ...c }));
		}
	}
	// Clear the hand initGame already dealt so only the staged draws remain.
	player.hand = [];
	player.pendingMega = produced.map((c) => ({ ...c }));
	state.phase = "mega";
	return state;
}

test("mega: eligibility needs 4 pending draws of a mega resource with pool copies", () => {
	const state = megaGame();
	const player = state.players[0] as PlayerState;
	assert.deepEqual(megaEligible(state, player), { water: 1 });
	// Ore and titanium have no group of 4.
	assert.equal(megaEligible(state, player).titanium, undefined);
	// An empty pool removes eligibility.
	state.megaSupply.water = 0;
	assert.deepEqual(megaEligible(state, player), {});
});

test("mega: ineligible players auto-confirm to singles and skip the mega phase", () => {
	const state = initGame(3, {}, "mega-auto");
	// Fresh setup: nobody has 4 manned factories of one resource, so production
	// goes straight to hands and the phase is never "mega".
	assert.notEqual(state.phase, "mega");
	for (const p of state.players) {
		assert.equal(p.pendingMega?.length ?? 0, 0);
	}
});

test("mega: converting 4 draws takes one fixed-value mega card and keeps the rest", () => {
	const state = megaGame();
	const player = state.players[0] as PlayerState;
	const before = state.megaSupply.water ?? 0;
	// Select the four highest water draws (indices 0-3); keep the 5-value water and the ore.
	applyMove(state, { action: "mega", cards: [0, 1, 2, 3] }, 0);
	assert.equal(state.megaSupply.water, before - 1);
	const megas = player.hand.filter((c) => c.m);
	assert.equal(megas.length, 1);
	assert.equal(megas[0]?.t, "water");
	assert.equal(megas[0]?.v, MEGA_CARDS.water?.value);
	// The unselected singles join the hand.
	assert.equal(player.hand.filter((c) => !c.m).length, 2);
	assert.equal(player.pendingMega?.length, 0);
});

test("mega: taking all singles is a valid choice", () => {
	const state = megaGame();
	const player = state.players[0] as PlayerState;
	applyMove(state, { action: "mega", cards: [] }, 0);
	assert.equal(player.hand.filter((c) => c.m).length, 0);
	assert.equal(player.hand.length, 6);
	assert.equal(player.pendingMega?.length, 0);
});

test("mega: a mega card counts as 4 toward hand capacity", () => {
	const state = megaGame();
	const player = state.players[0] as PlayerState;
	applyMove(state, { action: "mega", cards: [0, 1, 2, 3] }, 0);
	// 1 mega (4) + 2 singles = 6 counting cards.
	assert.equal(countingHandSize(player), 6);
});

test("mega: rejects a selection that is not full groups of 4 of one resource", () => {
	const state = megaGame();
	// 3 water draws: not a full group.
	assert.throws(() => applyMove(state, { action: "mega", cards: [0, 1, 2] }, 0));
	// Mixed resources.
	assert.throws(() => applyMove(state, { action: "mega", cards: [0, 1, 2, 5] }, 0));
});

test("mega: rejects converting more groups than the pool holds", () => {
	const state = megaGame();
	state.megaSupply.water = 0;
	assert.throws(() => applyMove(state, { action: "mega", cards: [0, 1, 2, 3] }, 0));
});

test("mega: spending a mega card returns it to the pool", () => {
	const state = megaGame();
	const player = state.players[0] as PlayerState;
	applyMove(state, { action: "mega", cards: [0, 1, 2, 3] }, 0);
	const afterTake = state.megaSupply.water ?? 0;
	// Force a discard of the mega card (index of the mega in hand).
	const megaIndex = player.hand.findIndex((c) => c.m);
	player.mustDiscard = true;
	state.phase = "discard";
	applyMove(state, { action: "discard", cards: [megaIndex] }, 0);
	assert.equal(state.megaSupply.water, afterTake + 1);
	// The mega does not enter the shuffled discard pile.
	assert.ok(!state.discards.water.includes(MEGA_CARDS.water?.value ?? -1));
});

test("mega: currentPlayer lists everyone still staging their production", () => {
	const state = initGame(3, {}, "mega-current");
	// Stage all three players with pending draws.
	for (const p of state.players) {
		p.pendingMega = [{ t: "water", v: 5 }];
	}
	state.phase = "mega";
	const waiting = currentPlayer(state);
	assert.ok(Array.isArray(waiting) && waiting.length === 3);
	applyMove(state, { action: "mega", cards: [] }, 0);
	assert.ok(!((currentPlayer(state) as number[]) ?? []).includes(0));
});

test("mega: held mega cards stay public through stripSecret", () => {
	const state = megaGame();
	const player = state.players[0] as PlayerState;
	applyMove(state, { action: "mega", cards: [0, 1, 2, 3] }, 0);
	const stripped = stripSecret(state, 1);
	const strippedHand = (stripped.players[0] as PlayerState).hand;
	const mega = strippedHand.find((c) => c.m);
	// The mega's printed value is public; the singles are hidden.
	assert.equal(mega?.v, MEGA_CARDS.water?.value);
	assert.ok(strippedHand.filter((c) => !c.m).every((c) => c.v === -1));
});

test("mega: full flow replays identically, including from a stripped log", () => {
	const state = megaGame();
	applyMove(state, { action: "mega", cards: [0, 1, 2, 3] }, 0);
	const live = state.players[0] as PlayerState;
	const liveHand = JSON.stringify(live.hand);

	const replayed = replay(state);
	const replayedHand = JSON.stringify((replayed.players[0] as PlayerState).hand);
	assert.equal(replayedHand, liveHand);
	assert.equal(replayed.megaSupply.water, state.megaSupply.water);

	// From the perspective of seat 1 (hand hidden, mega value public).
	const strippedReplay = replay(stripSecret(state, 1));
	const replayMega = (strippedReplay.players[0] as PlayerState).hand.find((c) => c.m);
	assert.equal(replayMega?.v, MEGA_CARDS.water?.value);
	assert.equal(strippedReplay.megaSupply.water, state.megaSupply.water);
	assert.equal(handValue(strippedReplay.players[0] as PlayerState) >= 0, true);
});
