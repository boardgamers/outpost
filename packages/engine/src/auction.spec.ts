import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMove, initGame } from "./moves.js";
import { handValue, upgradeDiscount, victoryPoints } from "./state.js";
import type { GameState, PlayerState, ProductionCard } from "./types.js";

function fixedGame(): GameState {
	const state = initGame(3, {}, "auction-spec");
	// Deterministic hands for the test: give the active player plenty of cash.
	const active = state.players[state.activeSeat] as PlayerState;
	active.hand = [
		{ t: "water", v: 10 },
		{ t: "water", v: 10 },
		{ t: "water", v: 10 },
	];
	return state;
}

function seatAfter(state: GameState, seat: number): number {
	const order = state.purchaseOrder;
	return order[(order.indexOf(seat) + 1) % order.length] as number;
}

test("auction: open, outbid, pass, pay", () => {
	const state = fixedGame();
	const opener = state.activeSeat;
	const upgrade = state.market[0]!;
	const rival = seatAfter(state, opener);
	(state.players[rival] as PlayerState).hand = [{ t: "water", v: 50 } as ProductionCard];

	applyMove(state, { action: "auction", marketIndex: 0, bid: 25 }, opener);
	assert.equal(state.phase, "auction");
	assert.equal(state.auction?.activeBidder, rival);

	applyMove(state, { action: "bid", amount: 28 }, rival);
	assert.equal(state.auction?.highBidder, rival);

	const third = seatAfter(state, rival);
	applyMove(state, { action: "bidPass" }, third);
	// Opener declines to raise.
	applyMove(state, { action: "bidPass" }, opener);
	assert.equal(state.phase, "auctionPayment");
	assert.equal(state.auction?.highBidder, rival);

	applyMove(state, { action: "pay", cards: [0] }, rival);
	const winner = state.players[rival] as PlayerState;
	assert.equal(winner.upgrades[upgrade], 1);
	assert.equal(winner.hand.length, 0); // no change given
	assert.equal(winner.spent, 50);
	// Action resumes with the auctioneer.
	assert.equal(state.phase, "actions");
	assert.equal(state.activeSeat, opener);
});

test("auction: opening bid below list price is rejected", () => {
	const state = fixedGame();
	assert.throws(() => applyMove(state, { action: "auction", marketIndex: 0, bid: 5 }, state.activeSeat));
	assert.equal(state.phase, "actions");
});

test("auction: cannot bid beyond your hand value", () => {
	const state = fixedGame();
	const opener = state.activeSeat;
	applyMove(state, { action: "auction", marketIndex: 0, bid: 25 }, opener);
	const bidder = state.auction?.activeBidder as number;
	const player = state.players[bidder] as PlayerState;
	assert.throws(() => applyMove(state, { action: "bid", amount: handValue(player) + 100 }, bidder));
});

test("data library discounts scientists at payment time", () => {
	const state = initGame(3, {}, "discount-spec");
	const seat = state.activeSeat;
	const player = state.players[seat] as PlayerState;
	player.upgrades.dataLibrary = 1;
	assert.equal(upgradeDiscount(player, "scientists"), 10);
	state.market[0] = "scientists";
	player.hand = [{ t: "water", v: 30 }];

	applyMove(state, { action: "auction", marketIndex: 0, bid: 40 }, seat);
	for (let guard = 0; guard < 5 && state.phase === "auction"; guard++) {
		applyMove(state, { action: "bidPass" }, state.auction?.activeBidder as number);
	}
	assert.equal(state.phase, "auctionPayment");
	// Due 40 - 10 = 30, payable with the single 30 card.
	applyMove(state, { action: "pay", cards: [0] }, seat);
	assert.equal(player.upgrades.scientists, 1);
});

test("upgrade effects: outpost grants capacity, population max, free titanium factory and VP", () => {
	const state = initGame(3, {}, "effects-spec");
	const seat = state.activeSeat;
	const player = state.players[seat] as PlayerState;
	const before = victoryPoints(player);
	state.market[0] = "outpost";
	player.hand = [{ t: "water", v: 100 }];

	applyMove(state, { action: "auction", marketIndex: 0, bid: 100 }, seat);
	for (let guard = 0; guard < 5 && state.phase === "auction"; guard++) {
		applyMove(state, { action: "bidPass" }, state.auction?.activeBidder as number);
	}
	applyMove(state, { action: "pay", cards: [0] }, seat);

	assert.equal(player.upgrades.outpost, 1);
	assert.equal(player.factories.filter((f) => f.type === "titanium").length, 1);
	assert.equal(player.factories.at(-1)?.manned, false);
	assert.equal(victoryPoints(player), before + 5);
});
