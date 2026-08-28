import assert from "node:assert/strict";
import { test } from "node:test";
import { KICKER_SPECS, kickerSetup } from "./data.js";
import { applyMove, initGame } from "./moves.js";
import { producePlayer } from "./production.js";
import { replay } from "./replay.js";
import { populationMax, robotMax, upgradeDiscount, victoryPoints } from "./state.js";
import { stripSecret } from "../wrapper.js";
import type { GameState, PlayerState, ProductionCard } from "./types.js";

function kickerGame(players = 4, seed = "kicker-spec"): GameState {
	return initGame(players, { kicker: true }, seed);
}

/** Give the active player a big hand and put a chosen Kicker card in slot 0 (also in the round entry, so replay sees it). */
function rich(state: GameState, kicker: keyof typeof KICKER_SPECS): number {
	const seat = state.activeSeat;
	const player = state.players[seat] as PlayerState;
	player.hand = Array.from({ length: 12 }, () => ({ t: "research", v: 30 }) as ProductionCard);
	state.kickerMarket[0] = kicker;
	const roundEntry = state.log.find((e) => e.type === "round");
	if (roundEntry && roundEntry.type === "round" && roundEntry.kickerMarket) {
		roundEntry.kickerMarket[0] = kicker;
	}
	return seat;
}

test("kicker: setup deals the right copies and slots per player count", () => {
	assert.deepEqual(kickerSetup(2), { copies: 1, slots: 1 });
	assert.deepEqual(kickerSetup(4), { copies: 1, slots: 1 });
	assert.deepEqual(kickerSetup(5), { copies: 2, slots: 2 });
	assert.deepEqual(kickerSetup(7), { copies: 2, slots: 2 });
	assert.deepEqual(kickerSetup(9), { copies: 3, slots: 3 });
});

test("kicker: era I slots are filled at setup, era piles hold the rest", () => {
	const state = kickerGame(4);
	assert.equal(state.kickerMarket.length, 1);
	// Era I has 4 types × 1 copy = 4 cards; 1 is in the slot, 3 remain.
	assert.equal(state.kickerPiles[1].length, 3);
	assert.equal(state.kickerPiles[2].length, 4);
	assert.equal(state.kickerPiles[3].length, 1);
	assert.equal(state.kickerEra, 1);
	// The slot card is an era I Kicker.
	assert.equal(KICKER_SPECS[state.kickerMarket[0]!].era, 1);
});

test("kicker: no kicker state when the option is off", () => {
	const state = initGame(4, {}, "plain");
	assert.equal(state.kickerMarket.length, 0);
	assert.equal(state.kickerPiles[1].length, 0);
});

test("kicker: buying a Kicker card adds it, pays, and frees the slot", () => {
	const state = kickerGame(4);
	const seat = rich(state, "smelter");
	applyMove(state, { action: "auction", marketIndex: 0, bid: 10, kicker: true }, seat);
	for (let guard = 0; guard < 5 && state.phase === "auction"; guard++) {
		applyMove(state, { action: "bidPass" }, state.auction?.activeBidder as number);
	}
	applyMove(state, { action: "pay", cards: [0] }, seat);
	const player = state.players[seat] as PlayerState;
	assert.equal(player.kickers.smelter, 1);
	assert.equal(state.kickerMarket.length, 0);
	assert.equal(player.spent, 30);
});

test("kicker: Robot Prototype grants a robot operable without a Robots upgrade", () => {
	const state = kickerGame(4);
	const seat = rich(state, "robotPrototype");
	applyMove(state, { action: "auction", marketIndex: 0, bid: 10, kicker: true }, seat);
	for (let guard = 0; guard < 5 && state.phase === "auction"; guard++) {
		applyMove(state, { action: "bidPass" }, state.auction?.activeBidder as number);
	}
	applyMove(state, { action: "pay", cards: [0] }, seat);
	const player = state.players[seat] as PlayerState;
	assert.equal(player.robots, 1);
	// No Robots upgrade: the prototype robot can still be operated.
	assert.equal(robotMax(player), 1);
});

test("kicker: NCF Prototype grants a New Chemicals factory with no research card spent", () => {
	const state = kickerGame(4);
	const seat = rich(state, "ncfPrototype");
	applyMove(state, { action: "auction", marketIndex: 0, bid: 60, kicker: true }, seat);
	for (let guard = 0; guard < 5 && state.phase === "auction"; guard++) {
		applyMove(state, { action: "bidPass" }, state.auction?.activeBidder as number);
	}
	applyMove(state, { action: "pay", cards: [0, 1] }, seat);
	const player = state.players[seat] as PlayerState;
	assert.equal(player.factories.filter((f) => f.type === "newChemicals").length, 1);
	assert.equal(player.kickers.ncfPrototype, 1);
});

test("kicker: Biosphere raises the population limit and scores its VP", () => {
	const state = kickerGame(4);
	const player = state.players[0] as PlayerState;
	const basePop = populationMax(player);
	const baseVp = victoryPoints(player);
	player.kickers.biosphere = 1;
	assert.equal(populationMax(player), basePop + 5);
	assert.equal(victoryPoints(player), baseVp + KICKER_SPECS.biosphere.vp);
});

test("kicker: Launch Facility and Smelter discounts apply to their upgrades", () => {
	const state = kickerGame(4);
	const player = state.players[0] as PlayerState;
	player.kickers.launchFacility = 1;
	player.kickers.smelter = 1;
	assert.equal(upgradeDiscount(player, "moonBase"), 30);
	assert.equal(upgradeDiscount(player, "spaceStation"), 30);
	assert.equal(upgradeDiscount(player, "robots"), 5);
	assert.equal(upgradeDiscount(player, "warehouse"), 0);
});

test("kicker: Ice Prospector draws an extra water card and discards the cheapest", () => {
	const state = kickerGame(4);
	const player = state.players[0] as PlayerState;
	player.kickers.iceProspector = 1;
	// 4 manned water factories.
	player.factories = [
		{ type: "water", manned: true },
		{ type: "water", manned: true },
		{ type: "water", manned: true },
		{ type: "water", manned: true },
	];
	const before = state.decks.water.length + state.discards.water.length;
	// Run a round's production for just this player via the engine path.
	const produced = producePlayer(state, player);
	// 4 factories + 1 Ice Prospector extra = 5 drawn, then 1 discarded = 4 kept.
	assert.equal(produced.filter((c) => c.t === "water").length, 4);
	// The discarded card returns to the discard pile, so deck+discard drops by
	// the 4 cards now held.
	assert.equal(state.decks.water.length + state.discards.water.length, before - 4);
});

test("kicker: Smelter draws a bonus ore card per two ore factories", () => {
	const state = kickerGame(4);
	const player = state.players[0] as PlayerState;
	player.kickers.smelter = 1;
	player.factories = [
		{ type: "ore", manned: true },
		{ type: "ore", manned: true },
		{ type: "ore", manned: true },
		{ type: "ore", manned: true },
	];
	const produced = producePlayer(state, player);
	// 4 factories + floor(4/2)=2 Smelter bonus = 6 ore cards.
	assert.equal(produced.filter((c) => c.t === "ore").length, 6);
});

test("kicker: the face-down piles are hidden by stripSecret, the slots stay public", () => {
	const state = kickerGame(4);
	const stripped = stripSecret(state, 0);
	// Pile contents are masked (same length, placeholder names).
	assert.equal(stripped.kickerPiles[1].length, state.kickerPiles[1].length);
	assert.deepEqual([...new Set(stripped.kickerPiles[1])], ["iceProspector"]);
	// The face-up slot card stays visible.
	assert.deepEqual(stripped.kickerMarket, state.kickerMarket);
});

test("kicker: a purchase replays identically from the log", () => {
	const state = kickerGame(4);
	const seat = rich(state, "smelter");
	applyMove(state, { action: "auction", marketIndex: 0, bid: 10, kicker: true }, seat);
	for (let guard = 0; guard < 5 && state.phase === "auction"; guard++) {
		applyMove(state, { action: "bidPass" }, state.auction?.activeBidder as number);
	}
	applyMove(state, { action: "pay", cards: [0] }, seat);
	const replayed = replay(state);
	assert.equal((replayed.players[seat] as PlayerState).kickers.smelter, 1);
	assert.equal(replayed.kickerMarket.length, state.kickerMarket.length);
});
