import assert from "node:assert/strict";
import { test } from "node:test";
import { UPGRADE_BY_ROLL } from "./data.js";
import { colonyEra, marketDie, refillMarket, updateEraStreaks } from "./market.js";
import { initGame } from "./moves.js";
import { bigThreshold } from "./state.js";
import type { GameState, PlayerState, Upgrade } from "./types.js";

function game(players = 3, seed = "market-spec"): GameState {
	return initGame(players, {}, seed);
}

function leader(state: GameState): PlayerState {
	return state.players[0] as PlayerState;
}

test("era: VP thresholds drive the era and the market die", () => {
	const state = game(3);
	assert.equal(colonyEra(state), 1);
	assert.deepEqual(marketDie(state), { sides: 4, offset: 0 });
	// Era II at 10 VP (4 Orbital Labs = 12 VP).
	leader(state).upgrades.orbitalLab = 4;
	assert.equal(colonyEra(state), 2);
	assert.deepEqual(marketDie(state), { sides: 10, offset: 0 });
	// Era III at the player-count threshold (35 for 3 players): Moon Base 20 VP.
	leader(state).upgrades.moonBase = 2;
	assert.ok(bigThreshold(state) <= 35);
	assert.equal(colonyEra(state), 3);
	assert.deepEqual(marketDie(state), { sides: 12, offset: 1 });
});

test("era: the 'very rare' fallback advances the era after two bare rounds", () => {
	const state = game(3);
	// Nobody has the VP for Era II, but upgrades 1-4 are all purchased.
	for (const u of UPGRADE_BY_ROLL.slice(0, 4)) {
		state.supply[u] = 0;
	}
	assert.equal(colonyEra(state), 1);
	// First bare round-begin: streak 1, still Era I.
	updateEraStreaks(state);
	assert.equal(state.eraStreak4, 1);
	assert.equal(colonyEra(state), 1);
	// Second consecutive bare round-begin: the era steps up to II.
	updateEraStreaks(state);
	assert.equal(state.eraStreak4, 2);
	assert.equal(colonyEra(state), 2);
	// A round where an upgrade 1-4 is restocked resets the streak.
	state.supply.dataLibrary = 1;
	updateEraStreaks(state);
	assert.equal(state.eraStreak4, 0);
});

test("era: the Era III fallback needs two rounds with upgrades 1-10 gone", () => {
	const state = game(3);
	for (const u of UPGRADE_BY_ROLL.slice(0, 10)) {
		state.supply[u] = 0;
	}
	// One bare round-begin: both streaks at 1, still Era I.
	updateEraStreaks(state);
	assert.equal(colonyEra(state), 1);
	// Second consecutive: both streaks at 2 — the 1-10 streak jumps straight to Era III.
	updateEraStreaks(state);
	assert.equal(state.eraStreak10, 2);
	assert.equal(colonyEra(state), 3);
});

test("era: states saved before the streak fields existed are treated as 0", () => {
	const state = game(3);
	delete state.eraStreak4;
	delete state.eraStreak10;
	for (const u of UPGRADE_BY_ROLL.slice(0, 4)) {
		state.supply[u] = 0;
	}
	updateEraStreaks(state);
	assert.equal(state.eraStreak4, 1); // not NaN
	updateEraStreaks(state);
	assert.equal(state.eraStreak4, 2);
	assert.equal(colonyEra(state), 2);
});

test("market: a roll with no matching card cascades to the next lower upgrade", () => {
	const state = game(4);
	// Era I (d4 → upgrades 1-4). Exhaust Nodule (#4) so a roll of 4 cascades down.
	state.supply.nodule = 0;
	state.market = [];
	// Fill every slot; the cascade must never offer the exhausted Nodule.
	refillMarket(state);
	assert.ok(state.market.length > 0);
	assert.ok(!state.market.includes("nodule"));
	for (const u of state.market) {
		assert.ok((UPGRADE_BY_ROLL.slice(0, 4) as Upgrade[]).includes(u));
	}
});

test("market: the type cap is half the players, rounded down", () => {
	const state = game(4); // cap = 2
	state.market = [];
	refillMarket(state);
	for (const u of new Set(state.market)) {
		assert.ok(state.market.filter((x) => x === u).length <= 2);
	}
});
