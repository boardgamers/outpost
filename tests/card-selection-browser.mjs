import assert from "node:assert/strict";
import { chromium } from "playwright";
import { previewServer } from "./tutorial-preview.mjs";
import { initGame } from "../packages/engine/dist/index.js";
import { stripSecret } from "../packages/engine/dist/wrapper.js";

async function checkCardSelection(page) {
	const show = async (state) => {
		await page.evaluate(
			(state) => {
				window.emitter = outpost.launch("#app");
				window.selectionMoves = [];
				emitter.on("move", (move) => selectionMoves.push(move));
				emitter.emit("preferences", { sound: false });
				emitter.emit("player", { index: 0 });
				emitter.emit("state", state);
			},
			stripSecret(state, 0)
		);
		await page.locator(".pcard.selected").first().waitFor();
	};
	for (const [hand, due, expected] of [
		[
			[{ t: "water", v: 30, m: true }, ...[7, 7, 8, 8].map((v) => ({ t: "water", v }))],
			30,
			"Mega Water: 30 credits (counts as 4 cards toward hand capacity)",
		],
		[
			[
				{ t: "research", v: 10 },
				{ t: "microbiotics", v: 10 },
				{ t: "water", v: 10 },
			],
			10,
			"Water: 10 credits",
		],
		[
			[
				{ t: "research", v: 10 },
				{ t: "microbiotics", v: 10 },
			],
			10,
			"Microbiotics: 10 credits",
		],
	]) {
		const state = initGame(3, {}, "payment-suggestion");
		state.players[0].hand = hand;
		state.phase = "auctionPayment";
		state.auction = {
			marketIndex: 0,
			upgrade: "dataLibrary",
			auctioneer: 0,
			highBid: due,
			highBidder: 0,
			passed: [1, 2],
			activeBidder: 0,
		};
		await show(state);
		assert.deepEqual(await page.locator(".pcard.selected").evaluateAll((cards) => cards.map((c) => c.title)), [
			expected,
		]);
	}
	const state = initGame(3, {}, "discard-suggestion");
	state.phase = "discard";
	state.players[0].mustDiscard = true;
	state.players[0].hand = [
		{ t: "water", v: 30, m: true },
		{ t: "titanium", v: 44, m: true },
		{ t: "newChemicals", v: 88, m: true },
		{ t: "ore", v: 1 },
	];
	await show(state);
	const confirm = page.getByRole("button", { name: "Discard selected", exact: true });
	assert.equal(await confirm.isEnabled(), true);
	assert.equal(await page.locator(".pcard.selected").count(), 1);
	await page.getByText(/Cards still to discard: 0 \(selected: 4;/).waitFor();
	const mega = page.getByTitle("Mega Water: 30 credits (counts as 4 cards toward hand capacity)", { exact: true });
	const ore = page.getByTitle("Ore: 1 credits", { exact: true });
	await mega.click();
	await ore.click();
	assert.equal(await confirm.isDisabled(), true, "three remaining Megas still exceed capacity");
	await page.getByText(/Cards still to discard: 2 \(selected: 1;/).waitFor();
	await ore.click();
	await mega.click();
	await confirm.click();
	assert.deepEqual(await page.evaluate(() => selectionMoves), [{ action: "discard", cards: [0] }]);
}

const server = previewServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ executablePath: process.env.OUTPOST_CHROMIUM_EXECUTABLE });
try {
	for (const width of [390, 1400]) {
		const page = await browser.newPage({ viewport: { width, height: 950 } });
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.setContent('<div id="app"></div>');
		await page.addStyleTag({ path: "packages/viewer/dist/outpost-viewer.css" });
		await page.addScriptTag({ url: `http://127.0.0.1:${server.address().port}/bundle.js` });
		await checkCardSelection(page);
		assert.deepEqual(errors, []);
		await page.close();
	}
	console.log("Card selection: payment preferences and weighted Mega discards passed on mobile and desktop.");
} finally {
	await browser.close();
	await new Promise((resolve) => server.close(resolve));
}
