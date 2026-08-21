import assert from "node:assert/strict";
import { test } from "node:test";
import { PRODUCTION_DECKS, SETUP_CHART } from "./data.js";
import { initGame } from "./moves.js";
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

test("initGame runs the first production round", () => {
	const state = initGame(3, {}, "seed");
	assert.equal(state.round, 1);
	for (const player of state.players) {
		assert.equal(player.hand.length, 3); // 2 ore + 1 water
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
