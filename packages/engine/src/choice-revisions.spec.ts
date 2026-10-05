import assert from "node:assert/strict";
import { test } from "node:test";
import { UPGRADE_SPECS } from "./data.js";
import { applyMove, initGame } from "./moves.js";
import { choiceRevision } from "./choice-revisions.js";
import { canMoveOutOfTurn, currentPlayer, isLiveUpdate, logLength, logSlice, stripSecret } from "../wrapper.js";
import { replay } from "./replay.js";
import type { GameState, ProductionCard } from "./types.js";

function auctionState(players = 4): GameState {
	const state = initGame(players, { fastBid: true }, "compact-bids");
	const round = state.log[1]!;
	assert.equal(round.type, "round");
	for (const [seat, player] of state.players.entries()) {
		player.hand = Array.from({ length: 6 }, (): ProductionCard => ({ t: "research", v: 10 }));
		round.produced[seat] = { player: seat, cards: structuredClone(player.hand) };
	}
	applyMove(
		state,
		{ action: "auction", marketIndex: state.market.findIndex((u) => UPGRADE_SPECS[u].price === 25), bid: 25 },
		state.activeSeat
	);
	return state;
}

function assertReplay(state: GameState): void {
	for (const viewer of [undefined, ...state.players.map((_, seat) => seat)]) {
		const source = viewer === undefined ? state : stripSecret(state, viewer);
		const replayed = replay(JSON.parse(JSON.stringify(source)));
		const rebuilt = viewer === undefined ? replayed : stripSecret(replayed, viewer);
		assert.equal(rebuilt.phase, source.phase);
		assert.equal(rebuilt.moveCount, source.moveCount);
		assert.deepEqual(rebuilt.auction, source.auction);
		assert.deepEqual(rebuilt.log, source.log);
		for (const [seat, player] of source.players.entries()) {
			assert.deepEqual(rebuilt.players[seat]!.hand, player.hand);
			assert.deepEqual(rebuilt.players[seat]!.pendingMega, player.pendingMega);
			assert.deepEqual(rebuilt.players[seat]!.megaChoice, player.megaChoice);
		}
	}
}

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
	assert.equal(bids.length, 1);
	assert.equal(bids[0]?.type === "move" && bids[0].move.action === "bid" && bids[0].move.amount, 30);
	assert.equal(replay(state).auction?.highBid, 31);
	assert.equal(replay(view).auction?.highBid, 31);
});

test("interleaved sealed bid revisions replace their original slots through save/load and replay", () => {
	let state = auctionState();
	const opener = state.activeSeat;
	const [first, second, last] = state.players.map((_, seat) => seat).filter((seat) => seat !== opener) as [
		number,
		number,
		number,
	];
	applyMove(state, { action: "bid", amount: 45 }, first);
	applyMove(state, { action: "bidPass" }, second);
	const length = logLength(state);
	const count = state.moveCount;
	const revision = choiceRevision(state, first)!;
	for (let i = 0; i < 8; i++) {
		state = JSON.parse(JSON.stringify(state));
		applyMove(state, { action: "bidPass", revision }, first);
		applyMove(state, { action: "bid", amount: 32, revision }, second);
		applyMove(state, { action: "bid", amount: 30 + i, revision }, first);
		applyMove(state, { action: "bid", amount: 41, revision }, opener);
		assert.equal(logLength(state), length);
		assert.equal(state.moveCount, count);
		assert(isLiveUpdate(state));
		assert.equal(currentPlayer(state), last);
		assert.equal(choiceRevision(state, first), revision);
		assert.deepEqual(logSlice(state, { player: last, start: length }).log, []);
		const view = stripSecret(state, last);
		assert.equal(view.auction?.bids?.[first], -1);
		const hidden = view.log.find((entry) => entry.type === "move" && entry.player === first);
		assert(hidden?.type === "move" && hidden.move.action === "bid" && hidden.move.amount === -1);
		assertReplay(state);
	}
	applyMove(state, { action: "bid", amount: 35 }, last);
	assert.equal(logLength(state), length + 1);
	assert.equal(state.moveCount, count + 1);
	assert(!isLiveUpdate(state));
	assert.equal(state.auction?.highBidder, opener);
	assert.equal(state.auction?.highBid, 38);
	assertReplay(state);
	assert.throws(() => applyMove(state, { action: "bid", amount: 40, revision }, first));
});

test("revising a recorded automatic sealed pass does not create a move", () => {
	const state = initGame(4, { fastBid: true }, "compact-auto-pass");
	const opener = state.activeSeat;
	const [passed, bidder] = state.players.map((_, seat) => seat).filter((seat) => seat !== opener) as [number, number];
	const round = state.log[1]!;
	assert.equal(round.type, "round");
	for (const [seat, player] of state.players.entries()) {
		player.hand = Array.from({ length: 6 }, (): ProductionCard => ({ t: "research", v: seat === passed ? 1 : 10 }));
		round.produced[seat] = { player: seat, cards: structuredClone(player.hand) };
	}
	state.players[passed]!.settings.autoPassBids = true;
	applyMove(state, { action: "auction", marketIndex: 0, bid: 25 }, opener);
	assert.equal(state.auction!.bids![passed], 0);
	const before = structuredClone(state.log);
	const count = state.moveCount;
	const untouched = structuredClone(state);
	assert.throws(
		() => applyMove(state, { action: "bid", amount: 30, revision: choiceRevision(state, passed)! }, passed),
		/automatic pass/
	);
	assert.deepEqual(state, untouched);
	applyMove(state, { action: "bidPass", revision: choiceRevision(state, passed)! }, passed);
	assert.deepEqual(state.log, before);
	assert.equal(state.moveCount, count);
	assert(isLiveUpdate(state));
	assert(Array.isArray(currentPlayer(state)));
	assertReplay(state);
	applyMove(state, { action: "bid", amount: 30 }, bidder);
	assertReplay(state);
});

test("a later sealed auction never changes a completed auction's history", () => {
	const state = auctionState();
	const opener = state.activeSeat;
	const oldRevision = choiceRevision(state, opener)!;
	for (const seat of state.players.map((_, index) => index).filter((index) => index !== opener)) {
		applyMove(state, { action: "bidPass" }, seat);
	}
	applyMove(state, { action: "pay", cards: [0, 1, 2] }, opener);
	const finished = structuredClone(state.log);
	applyMove(state, { action: "auction", marketIndex: 0, bid: 25 }, opener);
	const length = state.log.length;
	assert.throws(() => applyMove(state, { action: "bid", amount: 30, revision: oldRevision }, opener));
	applyMove(state, { action: "bid", amount: 30, revision: choiceRevision(state, opener)! }, opener);
	assert.equal(state.log.length, length);
	assert.deepEqual(state.log.slice(0, finished.length), finished);
	assertReplay(state);
});

test("old appended revisions still replay and new edits keep their last slot", () => {
	const state = auctionState();
	const bidder = state.players.findIndex((_, seat) => seat !== state.activeSeat);
	applyMove(state, { action: "bid", amount: 45 }, bidder);
	const revision = choiceRevision(state, bidder)!;
	const entry = state.log.at(-1)!;
	assert.equal(entry.type, "move");
	state.log.push({ ...entry, move: { action: "bid", amount: 30, revision } });
	state.moveCount++;
	state.auction!.bids![bidder] = 30;
	assertReplay(state);
	const length = state.log.length;
	applyMove(state, { action: "bidPass", revision }, bidder);
	assert.equal(state.log.length, length);
	assertReplay(state);
	applyMove(state, { action: "bid", amount: 38, revision }, bidder);
	assert.equal(state.log.length, length);
	assertReplay(state);
});

test("interleaved Mega revisions replace choices without revealing production and replay final choices", () => {
	let state = initGame(3, {}, "compact-mega");
	state.phase = "mega";
	const round = state.log[1]!;
	assert.equal(round.type, "round");
	round.megaGroups = [];
	for (const [seat, player] of state.players.entries()) {
		player.hand = [];
		player.pendingMega = Array.from({ length: 4 }, (): ProductionCard => ({ t: "water", v: 7 }));
		player.megaGroups = { water: 1 };
		delete player.megaChoice;
		round.produced[seat] = { player: seat, cards: structuredClone(player.pendingMega) };
		round.megaGroups.push({ player: seat, groups: { water: 1 } });
	}
	applyMove(state, { action: "mega", take: { water: 1 } }, 0);
	applyMove(state, { action: "mega", take: {} }, 1);
	const length = state.log.length;
	const count = state.moveCount;
	const revision = choiceRevision(state, 0)!;
	for (let i = 0; i < 8; i++) {
		state = JSON.parse(JSON.stringify(state));
		applyMove(state, { action: "mega", take: {}, revision }, 0);
		applyMove(state, { action: "mega", take: { water: 1 }, revision }, 1);
		applyMove(state, { action: "mega", take: { water: 1 }, revision }, 0);
		assert.equal(state.log.length, length);
		assert.equal(state.moveCount, count);
		assert.equal(currentPlayer(state), 2);
		assert(isLiveUpdate(state));
		assertReplay(state);
		assert(stripSecret(state, 0).players[0]!.pendingMega!.every((card) => card.v === -1));
		const hidden = stripSecret(state, 2).log.slice(2);
		assert(hidden.every((entry) => entry.type === "move" && entry.info?.megaSealed));
	}
	applyMove(state, { action: "mega", take: {} }, 2);
	assert.equal(state.log.length, length + 1);
	assert.equal(state.moveCount, count + 1);
	assert(!isLiveUpdate(state));
	assert.deepEqual(state.players[0]!.hand, [{ t: "water", v: 30, m: true }]);
	assertReplay(state);
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
