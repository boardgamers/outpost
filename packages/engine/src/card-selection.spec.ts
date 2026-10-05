import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMove, initGame } from "./moves.js";
import { bestDiscard, bestPayment, countingHandSize, handCardSize } from "./state.js";
import type { ProductionCard } from "./types.js";

function playerWith(hand: ProductionCard[]) {
	const player = initGame(3, {}, "card-selection").players[0]!;
	player.hand = hand;
	return player;
}

test("payment: spend a Mega before the same value in singles", () => {
	const player = playerWith([
		{ t: "water", v: 7 },
		{ t: "water", v: 7 },
		{ t: "water", v: 8 },
		{ t: "water", v: 8 },
		{ t: "water", v: 30, m: true },
	]);
	assert.deepEqual(bestPayment(player, 30), [4]);
	assert.deepEqual(bestPayment(player, 7), [0]);
});

test("payment: prefer freeing hand capacity over spending exempt cards", () => {
	const player = playerWith([
		{ t: "research", v: 4 },
		{ t: "microbiotics", v: 6 },
		{ t: "water", v: 10 },
	]);
	assert.deepEqual(bestPayment(player, 10), [2]);
	player.hand = [
		{ t: "water", v: 30, m: true },
		{ t: "titanium", v: 10 },
		{ t: "titanium", v: 10 },
		{ t: "titanium", v: 10 },
	];
	assert.deepEqual(bestPayment(player, 30), [0]);
});

test("payment: preserve Research for New Chemicals, including when research is required", () => {
	const player = playerWith([
		{ t: "research", v: 10 },
		{ t: "microbiotics", v: 10 },
		{ t: "research", v: 10 },
	]);
	assert.deepEqual(bestPayment(player, 10), [1]);
	assert.deepEqual(bestPayment(player, 20, true), [0, 1]);
	player.hand = [{ t: "microbiotics", v: 20 }];
	assert.equal(bestPayment(player, 10, true), null);
});

test("payment: minimum overpayment takes precedence over card preferences", () => {
	const player = playerWith([
		{ t: "water", v: 30, m: true },
		{ t: "research", v: 9 },
		{ t: "microbiotics", v: 10 },
	]);
	assert.deepEqual(bestPayment(player, 9), [1]);
	assert.deepEqual(bestPayment(player, 8), [1]);
	assert.deepEqual(bestPayment(player, 0), []);
	assert.equal(bestPayment(player, 50), null);
});

test("hand capacity: Megas count as four; Research and Microbiotics count as zero", () => {
	const player = playerWith([
		{ t: "water", v: 30, m: true },
		{ t: "ore", v: 3 },
		{ t: "research", v: 8 },
		{ t: "microbiotics", v: 15 },
	]);
	assert.equal(countingHandSize(player), 5);
	assert.deepEqual(player.hand.map(handCardSize), [4, 1, 0, 0]);
});

test("discard: free four slots with one Mega when that loses fewer credits", () => {
	const player = playerWith([
		{ t: "water", v: 30, m: true },
		...Array.from({ length: 10 }, (): ProductionCard => ({ t: "titanium", v: 10 })),
		{ t: "research", v: 1 },
		{ t: "microbiotics", v: 1 },
	]);
	assert.equal(countingHandSize(player), 14);
	assert.deepEqual(bestDiscard(player), [0]);
	const retained = player.hand.filter((_, index) => !bestDiscard(player).includes(index));
	assert.equal(countingHandSize({ ...player, hand: retained }), 10);
});

test("discard: keep a valuable Mega when a cheap single is enough", () => {
	const player = playerWith([
		{ t: "water", v: 30, m: true },
		...Array.from({ length: 7 }, (_, index): ProductionCard => ({ t: "ore", v: index + 1 })),
		{ t: "research", v: 1 },
	]);
	assert.deepEqual(bestDiscard(player), [1]);
	player.hand = [{ t: "water", v: 30, m: true }];
	assert.deepEqual(bestDiscard(player), []);
});

test("discard: the engine rejects a selection that leaves Megas over the limit", () => {
	const state = initGame(3, {}, "mega-discard-limit");
	const player = state.players[0]!;
	player.hand = [
		{ t: "water", v: 30, m: true },
		{ t: "titanium", v: 44, m: true },
		{ t: "newChemicals", v: 88, m: true },
		{ t: "ore", v: 1 },
	];
	player.mustDiscard = true;
	state.phase = "discard";
	const before = structuredClone(state);
	assert.throws(() => applyMove(state, { action: "discard", cards: [3] }, 0), /hand capacity/);
	assert.deepEqual(state, before);
	applyMove(state, { action: "discard", cards: bestDiscard(player) }, 0);
	assert.ok(countingHandSize(player) <= 10);
});

test("payment: dynamic selection matches exhaustive subsets across amounts and research requirements", () => {
	const player = playerWith([
		{ t: "research", v: 7 },
		{ t: "microbiotics", v: 7 },
		{ t: "water", v: 30, m: true },
		{ t: "water", v: 8 },
		{ t: "titanium", v: 10 },
		{ t: "research", v: 5 },
		{ t: "ore", v: 2 },
		{ t: "water", v: 0 },
	]);
	const subsets = Array.from({ length: 1 << player.hand.length }, (_, mask) =>
		player.hand.flatMap((_, index) => (mask & (1 << index) ? [index] : []))
	);
	const score = (pick: number[]) => {
		const cards = pick.map((index) => player.hand[index]!);
		return [
			cards.reduce((sum, card) => sum + card.v, 0),
			-cards.reduce((sum, card) => sum + (card.t === "research" || card.t === "microbiotics" ? 0 : card.m ? 4 : 1), 0),
			-cards.filter((c) => c.m).length,
			cards.filter((c) => c.t === "research").length,
			-cards.length,
		];
	};
	const compare = (a: number[], b: number[]) => {
		const left = score(a),
			right = score(b);
		return left.map((value, index) => value - right[index]!).find((value) => value !== 0) ?? 0;
	};
	for (const forced of [false, true]) {
		for (let due = 1; due <= 71; due++) {
			const expected = subsets
				.filter(
					(pick) => score(pick)[0]! >= due && (!forced || pick.some((index) => player.hand[index]!.t === "research"))
				)
				.sort(compare)[0];
			const actual = bestPayment(player, due, forced);
			assert.deepEqual(
				actual === null ? null : score(actual),
				expected ? score(expected) : null,
				`due=${due}, research=${forced}`
			);
		}
	}
});

test("payment: bulk New Chemicals reserves one research card per factory", () => {
	const player = playerWith([
		{ t: "research", v: 10 },
		{ t: "microbiotics", v: 10 },
		{ t: "research", v: 10 },
		{ t: "newChemicals", v: 88, m: true },
		{ t: "water", v: 30, m: true },
	]);
	assert.deepEqual(bestPayment(player, 120, 2), [0, 2, 3, 4]);
	assert.equal(bestPayment(player, 120, 3), null);
});
