import assert from "node:assert/strict";
import { test } from "node:test";
import { UPGRADE_SPECS } from "./data.js";
import { applyMove, initGame } from "./moves.js";
import { choiceRevision } from "./choice-revisions.js";
import { canMoveOutOfTurn, currentPlayer, isLiveUpdate, stripSecret } from "../wrapper.js";
import { replay } from "./replay.js";
import type { ProductionCard } from "./types.js";

test("sealed bids can be replaced or passed without reopening turns or earning time", () => {
	const state = initGame(3, { fastBid: true }, "revise-bids");
	for (const p of state.players) {
		p.hand = Array.from({ length: 6 }, (): ProductionCard => ({ t: "research", v: 10 }));
	}
	const opener = state.activeSeat;
	const [bidder, last] = state.players.map((_, i) => i).filter((i) => i !== opener) as [number, number];
	applyMove(
		state,
		{ action: "auction", marketIndex: state.market.findIndex((u) => UPGRADE_SPECS[u].price === 25), bid: 25 },
		opener
	);
	applyMove(state, { action: "bid", amount: 45 }, bidder);
	const revision = choiceRevision(state, bidder)!;
	const move = { action: "bid" as const, amount: 30, revision };
	assert(canMoveOutOfTurn(state, move, bidder));
	assert(!canMoveOutOfTurn(state, move, last));
	assert(!canMoveOutOfTurn(state, { ...move, revision: "old" }, bidder));
	const before = structuredClone(state);
	assert.throws(() => applyMove(state, { ...move, amount: 500 }, bidder));
	assert.deepEqual(state, before);
	applyMove(state, move, bidder);
	assert(isLiveUpdate(state));
	assert.equal(currentPlayer(state), last);
	assert.equal(state.auction?.bids?.[bidder], 30);
	assert.equal(stripSecret(state, last).auction?.bids?.[bidder], -1);
	applyMove(state, { action: "bidPass", revision }, bidder);
	assert(isLiveUpdate(state));
	applyMove(state, move, bidder);
	applyMove(state, { action: "bid", amount: 35 }, last);
	assert(!isLiveUpdate(state));
	assert.equal(state.auction?.highBidder, last);
	assert.equal(state.auction?.highBid, 31);
	assert(!canMoveOutOfTurn(state, move, bidder));
	assert.throws(() => applyMove(state, move, bidder));
	const view = stripSecret(state, last);
	const bids = view.log.filter((e) => e.type === "move" && e.player === bidder && e.move.action === "bid");
	assert.equal(bids[0]?.type === "move" && bids[0].move.action === "bid" && bids[0].move.amount, -1);
	assert.equal(replay(state).auction?.highBid, 31);
	assert.equal(replay(view).auction?.highBid, 31);
});

test("blind mega elections remain editable until the last election, without revealing draws", () => {
	const state = initGame(3, {}, "revise-mega");
	state.phase = "mega";
	for (const p of state.players) {
		p.pendingMega = Array.from({ length: 4 }, (): ProductionCard => ({ t: "water", v: 7 }));
		p.megaGroups = { water: 1 };
		delete p.megaChoice;
	}
	applyMove(state, { action: "mega", take: { water: 1 } }, 0);
	const move = { action: "mega" as const, take: {}, revision: choiceRevision(state, 0)! };
	assert(canMoveOutOfTurn(state, move, 0));
	applyMove(state, move, 0);
	assert(isLiveUpdate(state));
	assert.deepEqual(currentPlayer(state), [1, 2]);
	assert(stripSecret(state, 0).players[0]!.pendingMega!.every((c) => c.v === -1));
	applyMove(state, { action: "mega", take: {} }, 1);
	applyMove(state, { action: "mega", take: {} }, 2);
	assert(!canMoveOutOfTurn(state, move, 0));
	assert.throws(() => applyMove(state, move, 0));
});
