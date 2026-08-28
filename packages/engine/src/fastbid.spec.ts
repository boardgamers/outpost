import assert from "node:assert/strict";
import { test } from "node:test";
import { UPGRADE_SPECS } from "./data.js";
import { applyMove, initGame } from "./moves.js";
import { replay } from "./replay.js";
import { currentPlayer, stripSecret } from "../wrapper.js";
import type { GameState, PlayerState, ProductionCard } from "./types.js";

function fastGame(): GameState {
	const state = initGame(3, { fastBid: true }, "fastbid-spec");
	// Research cards: a fixed 60-credit hand that is not mega-eligible, so the
	// round entry replays to singles and matches the live hand exactly.
	for (const p of state.players) {
		p.hand = Array.from({ length: 6 }, () => ({ t: "research", v: 10 }) as ProductionCard);
	}
	return state;
}

function seatAfter(state: GameState, seat: number): number {
	const order = state.purchaseOrder;
	return order[(order.indexOf(seat) + 1) % order.length] as number;
}

function open(state: GameState, bid = 25): number {
	const opener = state.activeSeat;
	applyMove(state, { action: "auction", marketIndex: 0, bid }, opener);
	return opener;
}

test("fastBid: opening creates a sealed-bid auction with everyone pending", () => {
	const state = fastGame();
	const opener = open(state);
	assert.equal(state.phase, "auction");
	assert.deepEqual(state.auction?.bids, { [opener]: 25 });
	// Everyone but the opener is still expected to bid.
	const pending = currentPlayer(state);
	assert.ok(Array.isArray(pending));
	assert.deepEqual(
		[...(pending as number[])].sort(),
		[0, 1, 2].filter((s) => s !== opener)
	);
});

test("fastBid: bids are hidden from other players until all are in", () => {
	const state = fastGame();
	const opener = open(state);
	const second = seatAfter(state, opener);
	applyMove(state, { action: "bid", amount: 40 }, second);

	// The third player sees the opener's and second's bids as -1, not the amounts.
	const third = seatAfter(state, second);
	const stripped = stripSecret(state, third);
	assert.equal(stripped.auction?.bids?.[opener], -1);
	assert.equal(stripped.auction?.bids?.[second], -1);
	// The bidder sees their own bid.
	const own = stripSecret(state, second);
	assert.equal(own.auction?.bids?.[second], 40);
	assert.equal(own.auction?.bids?.[opener], -1);
	// The log masks the second player's bid amount for the third viewer.
	const bidEntry = stripped.log.find((e) => e.type === "move" && e.move.action === "bid" && e.player === second);
	assert.ok(bidEntry && bidEntry.type === "move" && bidEntry.move.action === "bid");
	assert.equal(bidEntry.move.amount, -1);
});

test("fastBid: resolves when all bids are in — second-highest + 1", () => {
	const state = fastGame();
	const opener = open(state, 25);
	const second = seatAfter(state, opener);
	const third = seatAfter(state, second);
	applyMove(state, { action: "bid", amount: 40 }, second);
	assert.equal(state.phase, "auction");
	applyMove(state, { action: "bid", amount: 30 }, third);
	assert.equal(state.phase, "auctionPayment");
	// Winner is the 40 bidder, pays runner-up (30) + 1 = 31.
	assert.equal(state.auction?.highBidder, second);
	assert.equal(state.auction?.highBid, 31);
	const entry = state.log.at(-1);
	assert.ok(entry?.type === "move" && entry.info?.winningBid === 40 && entry.info.secondBid === 30);
});

test("fastBid: price is capped at the winner's own bid when second is one below", () => {
	const state = fastGame();
	const opener = open(state, 25);
	const second = seatAfter(state, opener);
	const third = seatAfter(state, second);
	applyMove(state, { action: "bid", amount: 40 }, second);
	applyMove(state, { action: "bid", amount: 39 }, third);
	assert.equal(state.auction?.highBidder, second);
	// Runner-up + 1 would be 40, the winner's own bid — they never pay more.
	assert.equal(state.auction?.highBid, 40);
});

test("fastBid: tie goes to the earliest bidder in purchase order from the auctioneer", () => {
	const state = fastGame();
	const opener = open(state, 25);
	const second = seatAfter(state, opener);
	const third = seatAfter(state, second);
	// Opener bid 25; second and third both bid 40 → second is earlier in order.
	applyMove(state, { action: "bid", amount: 40 }, third);
	applyMove(state, { action: "bid", amount: 40 }, second);
	assert.equal(state.auction?.highBidder, second);
	// Tie: runner-up equals the tied bid, so the winner pays their own bid.
	assert.equal(state.auction?.highBid, 40);
});

test("fastBid: a sole bidder pays the list price", () => {
	const state = fastGame();
	const opener = open(state, 25);
	const second = seatAfter(state, opener);
	const third = seatAfter(state, second);
	applyMove(state, { action: "bidPass" }, second);
	applyMove(state, { action: "bidPass" }, third);
	assert.equal(state.phase, "auctionPayment");
	assert.equal(state.auction?.highBidder, opener);
	assert.equal(state.auction?.highBid, 25);
});

test("fastBid: bid below list price is rejected", () => {
	const state = fastGame();
	open(state, 25);
	const second = seatAfter(state, state.activeSeat);
	assert.throws(() => applyMove(state, { action: "bid", amount: 10 }, second));
});

test("fastBid: no auto-pass — a weak hand still gets to (secretly) pass", () => {
	const state = fastGame();
	const opener = state.activeSeat;
	const weak = seatAfter(state, opener);
	(state.players[weak] as PlayerState).hand = [];
	applyMove(state, { action: "auction", marketIndex: 0, bid: 25 }, opener);
	// The weak player is not skipped: they are still expected to bid/pass.
	const pending = currentPlayer(state);
	assert.ok(Array.isArray(pending) && pending.includes(weak));
	assert.ok(!state.auction?.passed.includes(weak));
});

test("fastBid: full flow replays identically, including from a stripped log", () => {
	const state = fastGame();
	// The replayed round entry must produce the same fixed hands.
	const roundEntry = state.log.find((e) => e.type === "round");
	assert.ok(roundEntry && roundEntry.type === "round");
	// A fixed hand of research cards (not a mega resource), so the round entry
	// auto-confirms to singles — there is no "mega" move in the log to replay.
	for (const rec of roundEntry.produced) {
		rec.cards = Array.from({ length: 6 }, () => ({ t: "research", v: 10 }) as ProductionCard);
	}
	const upgrade = state.market[0]!;
	const opener = open(state, 25);
	const second = seatAfter(state, opener);
	const third = seatAfter(state, second);
	applyMove(state, { action: "bid", amount: 40 }, second);
	applyMove(state, { action: "bid", amount: 30 }, third);
	assert.equal(state.phase, "auctionPayment");
	// Due 31: four 10-value cards (overpaid credits are lost).
	applyMove(state, { action: "pay", cards: [0, 1, 2, 3] }, second);
	const winner = state.players[second] as PlayerState;
	assert.equal(winner.spent, 40);
	assert.equal(winner.upgrades[upgrade], 1);

	const replayed = replay(state);
	assert.equal(replayed.phase, "actions");
	assert.equal(replayed.players[second]?.spent, 40);

	// A stripped log (sealed bids and the winner's hand hidden from this
	// viewer) must replay to the same public outcome: the upgrade went to the
	// winner and the action turn resumed with the auctioneer.
	const strippedReplay = replay(stripSecret(state, third));
	assert.equal(strippedReplay.phase, "actions");
	assert.equal(strippedReplay.activeSeat, opener);
	assert.equal(strippedReplay.players[second]?.upgrades[upgrade], 1);
	assert.equal(strippedReplay.market.length, state.market.length);
});

test("fastBid: payment due uses the resolved price with discount", () => {
	const state = initGame(3, { fastBid: true }, "fastbid-discount");
	const opener = state.activeSeat;
	const player = state.players[opener] as PlayerState;
	player.upgrades.dataLibrary = 1;
	state.market[0] = "scientists";
	player.hand = [{ t: "water", v: 30 }];
	const others = state.purchaseOrder.filter((s) => s !== opener);
	for (const s of others) {
		(state.players[s] as PlayerState).hand = [];
	}
	applyMove(state, { action: "auction", marketIndex: 0, bid: UPGRADE_SPECS.scientists.price }, opener);
	for (const s of others) {
		applyMove(state, { action: "bidPass" }, s);
	}
	assert.equal(state.phase, "auctionPayment");
	// List 40, sole bidder pays 40, discount 10 → due 30.
	applyMove(state, { action: "pay", cards: [0] }, opener);
	assert.equal(player.upgrades.scientists, 1);
});
