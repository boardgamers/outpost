import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { lessons } from "../packages/viewer/src/tutorial/lessons.ts";
import {
	bestPayment,
	handValue,
	victoryPoints,
	countingHandSize,
	productionRange,
	PRODUCTION_DECKS,
	RESOURCES,
} from "../packages/engine/dist/index.js";
import { stripSecret } from "../packages/engine/dist/wrapper.js";

const { createTutorial } = createRequire(new URL("../packages/viewer/package.json", import.meta.url))(
	"@boardgamers/protocol/tutorial"
);
const move = (value) => ({ kind: "move", move: value });
const answer = (value) => ({ kind: "answer", answer: value });
const pay = (state, due) => move({ action: "pay", cards: bestPayment(state.game.players[0], due) });
const paths = {
	colony: [
		null,
		answer("0"),
		move({
			action: "endTurn",
			buys: [{ buy: "factory", factory: "water", cards: [0, 1, 2, 3] }],
			manned: [1, 2, 3],
		}),
		{ kind: "watch" },
	],
	auctions: [
		null,
		move({ action: "auction", marketIndex: 0, bid: 25 }),
		move({ action: "bid", amount: 31 }),
		(state) => pay(state, 31),
	],
	"sealed-bids": [null, move({ action: "bid", amount: 60 }), answer("31"), (state) => pay(state, 31)],
	staffing: [
		null,
		answer("3"),
		move({ action: "endTurn", buys: [{ buy: "robots", count: 1, cards: [0] }], manned: [2, 3, 4, 5] }),
		{ kind: "watch" },
	],
	storage: [null, answer("12"), move({ action: "discard", cards: [0, 1] })],
	"new-chemicals": [
		null,
		answer("Spend one Research card per factory"),
		move({
			action: "endTurn",
			buys: [{ buy: "factory", factory: "newChemicals", cards: [0, 1, 2, 3, 4, 5] }],
			manned: [1, 2, 3, 4],
		}),
		{ kind: "watch" },
	],
	"mega-production": [null, move({ action: "mega", take: { water: 1 } }), answer("4")],
	victory: [
		null,
		answer("No, only staffed factories and upgrades score"),
		move({ action: "auction", marketIndex: 0, bid: 30 }),
		(state) => pay(state, 30),
		answer("Yes, finish the round first"),
		move({ action: "endTurn", buys: [], manned: [0, 1, 2, 3, 4] }),
	],
};
function validateState(game) {
	for (const resource of RESOURCES) {
		const total =
			game.decks[resource].length +
			game.discards[resource].length +
			game.players
				.flatMap((p) => [...p.hand, ...(p.pendingMega ?? [])])
				.filter((card) => card.t === resource && !card.m).length;
		assert.equal(
			total,
			Object.values(PRODUCTION_DECKS[resource].distribution).reduce((sum, n) => sum + n, 0),
			resource
		);
	}
	for (const [upgrade, remaining] of Object.entries(game.supply)) {
		assert.ok(remaining >= 0, `${upgrade} supply`);
		assert.equal(
			remaining +
				game.market.filter((u) => u === upgrade).length +
				game.players.reduce((sum, p) => sum + p.upgrades[upgrade], 0),
			2,
			upgrade
		);
	}
	const view = stripSecret(game, 0);
	assert.equal(view.seed, "");
	assert.ok(
		Object.values(view.decks)
			.flat()
			.every((value) => value === -1)
	);
	assert.ok(
		view.players
			.slice(1)
			.flatMap((p) => p.hand)
			.every((card) => card.m || card.v === -1)
	);
}
for (const lesson of lessons) {
	test(`${lesson.id}: legal play, checkpoints, private information and deterministic reload`, async () => {
		const saved = new Map();
		const options = {
			...lesson,
			storage: { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
		};
		let controller = await createTutorial(options);
		validateState(controller.snapshot.state.game);
		for (const [index, entry] of paths[lesson.id].entries()) {
			const before = controller.snapshot.state;
			if (entry === null) {
				await controller.continue();
			} else {
				await controller.play(typeof entry === "function" ? entry(before) : entry);
			}
			assert.equal(controller.snapshot.error, "");
			assert.equal(controller.snapshot.step, index + 1);
			validateState(controller.snapshot.state.game);
			const after = structuredClone(controller.snapshot.state);
			controller.destroy();
			controller = await createTutorial(options);
			assert.deepEqual(controller.snapshot.state, after);
			assert.equal(controller.snapshot.step, index + 1);
			await controller.previousStep();
			assert.deepEqual(controller.snapshot.state, before);
			if (entry === null) {
				await controller.continue();
			} else {
				await controller.play(typeof entry === "function" ? entry(before) : entry);
			}
			assert.deepEqual(controller.snapshot.state, after);
		}
		assert.ok(controller.snapshot.completed);
		const game = controller.snapshot.state.game;
		if (lesson.id === "colony") {
			assert.equal(game.players[0].spent, 21);
			assert.equal(productionRange(lesson.initialState().game.players[0]).avg, 13);
			for (const player of game.players.slice(0, 2)) {
				assert.equal(player.population, 3);
				assert.equal(player.factories.length, 4);
				assert.equal(victoryPoints(player), 3);
				assert.equal(productionRange(player).avg, 17);
				assert.deepEqual(player.hand.map((card) => card.t).sort(), ["ore", "water", "water"]);
			}
		} else if (lesson.id === "sealed-bids") {
			assert.equal(game.players[0].spent, 31);
			assert.equal(handValue(game.players[0]), 9);
		} else if (lesson.id === "staffing") {
			assert.equal(victoryPoints(game.players[0]), 11);
			assert.deepEqual(game.players[0].hand.map((card) => card.t).sort(), [
				"titanium",
				"titanium",
				"titanium",
				"water",
			]);
		} else if (lesson.id === "storage") {
			assert.equal(game.players[0].hand.length, 12);
			assert.equal(countingHandSize(game.players[0]), 10);
		} else if (lesson.id === "new-chemicals") {
			assert.equal(game.players[0].hand.filter((card) => card.t === "newChemicals").length, 1);
			assert.equal(game.players[0].hand.filter((card) => card.t === "research").length, 1);
		} else if (lesson.id === "mega-production") {
			assert.equal(handValue(game.players[0]), 30);
			assert.equal(countingHandSize(game.players[0]), 4);
		} else if (lesson.id === "victory") {
			assert.ok(game.ended);
			assert.equal(victoryPoints(game.players[0]), 75);
		}
		controller.destroy();
	});
}
test("wrong answers and unrelated moves leave the lesson unchanged", async () => {
	const controller = await createTutorial(lessons[0]);
	await controller.continue();
	const before = structuredClone(controller.snapshot.state);
	await controller.play(answer("1"));
	assert.equal(controller.snapshot.error, "Not quite. Try another answer.");
	assert.deepEqual(controller.snapshot.state, before);
	await controller.play(answer("0"));
	await controller.play(move({ action: "endTurn", buys: [], manned: [0, 1, 2] }));
	assert.ok(controller.snapshot.error);
	assert.deepEqual(controller.snapshot.state.game, before.game);
	controller.destroy();
});
test("New Chemicals cannot be paid for without spending Research", () => {
	const lesson = lessons.find((l) => l.id === "new-chemicals");
	const state = lesson.initialState();
	state.game.players[0].hand.push({ t: "moonOre", v: 60 });
	const before = structuredClone(state);
	assert.throws(
		() =>
			lesson.move(
				state,
				move({
					action: "endTurn",
					buys: [{ buy: "factory", factory: "newChemicals", cards: [6] }],
					manned: [1, 2, 3, 4],
				})
			),
		/research card/
	);
	assert.deepEqual(state, before);
});
test("sealed bids and blind Mega draws stay private until resolution", () => {
	const game = lessons.find((l) => l.id === "sealed-bids").initialState().game;
	assert.equal(stripSecret(game, 0).auction.bids[1], -1);
	const mega = lessons.find((l) => l.id === "mega-production").initialState().game;
	assert.ok(stripSecret(mega, 0).players[0].pendingMega.every((card) => card.v === -1));
});
