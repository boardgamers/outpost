import assert from "node:assert/strict";
import { test } from "node:test";
import { logSlice, stripSecret } from "../wrapper.js";
import { sealedAuctionHistory } from "./auction-history.js";
import { describeLog, describeLogEntry } from "./describe.js";
import { applyMove, initGame } from "./moves.js";
import { replay } from "./replay.js";
import type { GameState, ProductionCard } from "./types.js";

function game() {
	const state = initGame(4, { fastBid: true }, "auction-history");
	for (const player of state.players) {
		player.hand = Array.from({ length: 6 }, (): ProductionCard => ({ t: "research", v: 10 }));
	}
	const round = state.log.find((entry) => entry.type === "round");
	assert.ok(round?.type === "round");
	for (const produced of round.produced) {
		produced.cards = structuredClone(state.players[produced.player]!.hand);
	}
	return state;
}

function open(state: GameState) {
	const seats = [state.activeSeat, ...state.purchaseOrder.filter((seat) => seat !== state.activeSeat)];
	applyMove(state, { action: "auction", marketIndex: 0, bid: 25 }, seats[0]!);
	return seats as [number, number, number, number];
}

test("sealed history stays private until completion, including passes and the opening bid", () => {
	const state = game();
	const [opener, winner, passer, last] = open(state);
	applyMove(state, { action: "bid", amount: 40 }, winner);
	applyMove(state, { action: "bidPass" }, passer);
	for (const viewer of [undefined, opener, winner, passer, last]) {
		const during = stripSecret(state, viewer);
		assert.equal(sealedAuctionHistory(during.log).results.size, 0);
		assert.equal(sealedAuctionHistory(during.log).revealed.size, 0);
		assert.ok(describeLog(during).at(-1)?.includes("takes part"));
		assert.ok(describeLog(during).at(-2)?.includes("takes part"));
	}
	applyMove(state, { action: "bid", amount: 30 }, last);
	for (const viewer of [undefined, opener, winner, passer, last]) {
		const after = stripSecret(state, viewer);
		const history = sealedAuctionHistory(after.log);
		assert.equal(history.revealed.size, 4);
		assert.deepEqual(history.results.get(after.log.length - 1), {
			winner,
			bids: [
				{ player: winner, amount: 40 },
				{ player: last, amount: 30 },
				{ player: opener, amount: 25 },
				{ player: passer, amount: 0 },
			],
		});
	}
});

test("completed results keep every bid while descriptions show only the viewer's own amount", () => {
	const state = game();
	const [opener, winner, passer, last] = open(state);
	const openingIndex = state.log.length - 1;
	applyMove(state, { action: "bid", amount: 40 }, winner);
	applyMove(state, { action: "bidPass" }, passer);
	applyMove(state, { action: "bid", amount: 30 }, last);
	const resultIndex = state.log.length - 1;
	applyMove(state, { action: "pay", cards: [0, 1, 2, 3] }, winner);
	open(state);
	applyMove(state, { action: "bidPass" }, winner);
	for (const viewer of [undefined, opener, winner, passer, last]) {
		const visible = stripSecret(state, viewer);
		const lines = describeLog(visible, viewer);
		assert.match(lines[openingIndex]!, viewer === opener ? /up for auction at 25$/ : /up for sealed auction$/);
		assert.equal(
			lines[openingIndex + 1],
			`${state.players[winner]!.name} ${viewer === winner ? "bids 40" : "takes part in the sealed auction"}`
		);
		assert.equal(
			lines[openingIndex + 2],
			`${state.players[passer]!.name} ${viewer === passer ? "passes on the auction" : "takes part in the sealed auction"}`
		);
		assert.equal(describeLogEntry(visible, visible.log[openingIndex + 1]!, viewer), lines[openingIndex + 1]);
		assert.match(lines.at(-2)!, viewer === opener ? /up for auction at 25$/ : /up for sealed auction$/);
		assert.match(lines.at(-1)!, viewer === winner ? /passes on the auction$/ : /takes part in the sealed auction$/);
		assert.ok(lines.every((line) => !line.includes(" wins ")));
		assert.match(lines[resultIndex + 1]!, /buys .* \(paid 40\)$/);
		assert.deepEqual([...sealedAuctionHistory(visible.log).results.keys()], [resultIndex]);
		assert.deepEqual(
			sealedAuctionHistory(visible.log)
				.results.get(resultIndex)
				?.bids.map((bid) => bid.amount),
			[40, 30, 25, 0]
		);
		assert.equal(sealedAuctionHistory(visible.log).results.get(resultIndex)?.paid, 40);
		const slice = logSlice(state, { player: viewer, start: openingIndex + 1, end: openingIndex + 3 });
		assert.deepEqual(
			slice.log.map((entry) => entry.simple),
			lines.slice(openingIndex + 1, openingIndex + 3)
		);
	}
	const replayed = replay(stripSecret(state));
	assert.deepEqual(sealedAuctionHistory(replayed.log), sealedAuctionHistory(stripSecret(state).log));
});

test("own sealed bids remain visible while collecting bids without revealing other players' actions", () => {
	const state = game();
	const [opener, bidder, passer] = open(state);
	const openingIndex = state.log.length - 1;
	applyMove(state, { action: "bid", amount: 40 }, bidder);
	applyMove(state, { action: "bidPass" }, passer);
	for (const viewer of [undefined, opener, bidder, passer]) {
		const visible = stripSecret(state, viewer);
		const lines = describeLog(visible, viewer);
		assert.match(lines[openingIndex]!, viewer === opener ? /up for auction at 25$/ : /up for sealed auction$/);
		assert.match(lines.at(-2)!, viewer === bidder ? /bids 40$/ : /takes part in the sealed auction$/);
		assert.match(lines.at(-1)!, viewer === passer ? /passes on the auction$/ : /takes part in the sealed auction$/);
		assert.equal(sealedAuctionHistory(visible.log).results.size, 0);
		assert.deepEqual(
			logSlice(state, { player: viewer }).log.map((entry) => entry.simple),
			lines
		);
	}
});

test("an immediately resolved auction reveals the opener and every automatic pass", () => {
	const state = game();
	const opener = state.activeSeat;
	for (const [seat, player] of state.players.entries()) {
		if (seat !== opener) {
			player.hand = [];
		}
	}
	open(state);
	assert.equal(state.phase, "auctionPayment");
	const visible = stripSecret(state);
	const last = visible.log.at(-1);
	assert.ok(last?.type === "move" && last.move.action === "auction");
	assert.equal(last.move.bid, 25);
	const result = sealedAuctionHistory(visible.log).results.get(visible.log.length - 1);
	assert.equal(result?.bids.length, 4);
	assert.equal(result?.bids.filter((bid) => bid.amount === 0).length, 3);
	assert.deepEqual(result?.bids[0], { player: opener, amount: 25 });
});

test("a pass can resolve the result; tied bids put the winner first", () => {
	const state = game();
	const [opener, bidder, passer, last] = open(state);
	applyMove(state, { action: "bid", amount: 40 }, bidder);
	applyMove(state, { action: "bid", amount: 40 }, passer);
	applyMove(state, { action: "bidPass" }, last);
	const result = sealedAuctionHistory(stripSecret(state).log).results.get(state.log.length - 1)!;
	assert.equal(result.bids[0]?.player, state.auction?.highBidder);
	assert.equal(result.bids[0]?.amount, 40);
	assert.equal(result.bids.find((bid) => bid.player === opener)?.amount, 25);
	assert.equal(result.bids.find((bid) => bid.player === last)?.amount, 0);
});
