import assert from "node:assert/strict";
import { chromium } from "playwright";
import { previewServer } from "./tutorial-preview.mjs";
import { applyMove, initGame } from "../packages/engine/dist/index.js";
import { stripSecret } from "../packages/engine/dist/wrapper.js";

const server = previewServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ executablePath: process.env.OUTPOST_CHROMIUM_EXECUTABLE });
try {
	for (const width of [390, 1400]) {
		const page = await browser.newPage({ viewport: { width, height: 950 } });
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div>');
		await page.addStyleTag({ path: "packages/viewer/dist/outpost-viewer.css" });
		await page.addScriptTag({ url: `http://127.0.0.1:${server.address().port}/bundle.js` });
		for (const [kind, population, max, cards, buyFewer] of [
			["population", 2, 3, [{ t: "water", v: 30, m: true }]],
			["population", 4, 1, [{ t: "water", v: 30, m: true }]],
			["population", 2, 3, [{ t: "water", v: 30, m: true }], true],
			["robots", 2, 3, [{ t: "water", v: 30, m: true }]],
			["ore", 2, 3, [{ t: "water", v: 30, m: true }]],
			[
				"newChemicals",
				2,
				2,
				[
					{ t: "newChemicals", v: 88, m: true },
					{ t: "water", v: 30, m: true },
					{ t: "research", v: 10 },
					{ t: "research", v: 10 },
				],
			],
		]) {
			const state = initGame(3, {}, "bulk-purchase");
			state.phase = "actions";
			state.activeSeat = 0;
			state.players[0].population = population;
			state.players[0].upgrades.robots = 1;
			state.players[0].hand = cards;
			await page.evaluate(
				(state) => {
					outpost.destroy();
					window.emitter = outpost.launch("#app");
					window.bulkMoves = [];
					emitter.on("move", (move) => bulkMoves.push(move));
					emitter.emit("preferences", { sound: false });
					emitter.emit("player", { index: 0 });
					emitter.emit("state", state);
				},
				stripSecret(state, 0)
			);
			const selector =
				kind === "population"
					? ".operator-options .buy:first-of-type"
					: kind === "robots"
						? ".operator-options .buy:nth-of-type(2)"
						: `.buy.res-${kind}`;
			await page.locator(selector).click();
			const maxButton = page.getByRole("button", { name: "Max", exact: true });
			assert.equal(await maxButton.isEnabled(), max > 1);
			if (max === 3) {
				await page.locator(".purchase-flow .confirm").click();
				await page.locator('.bulk-hint[role="alert"]').waitFor();
				assert.equal(await page.locator(".pcard.selected").count(), 1);
				assert.match(await page.locator(".purchase-flow .confirm").innerText(), /anyway/);
				if (!buyFewer) {
					await page.getByRole("button", { name: "Increase quantity", exact: true }).click();
					assert.doesNotMatch(await page.locator(".purchase-flow .confirm").innerText(), /anyway/);
					await page.locator(".purchase-flow .confirm").click();
					await page.locator('.bulk-hint[role="alert"]').waitFor();
				}
			}
			if (max > 1 && !buyFewer) {
				await maxButton.click();
			}
			const expectedCount = buyFewer ? 1 : max;
			assert.equal(await page.locator(".quantity-value").textContent(), String(expectedCount));
			assert.equal(await page.getByRole("button", { name: "Increase quantity", exact: true }).isDisabled(), !buyFewer);
			if (kind === "newChemicals") {
				assert.equal(await page.locator(".pcard.selected").count(), 4);
				await page.getByText("◈ 18 lost (no change).", { exact: true }).waitFor();
			} else if (max === 3 && !buyFewer) {
				assert.equal(await page.locator(".pcard.selected").count(), 1);
				assert.equal(await page.locator(".overpay").count(), 0);
			}
			assert.equal(await page.locator(".purchase-flow .confirm").isEnabled(), true);
			assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
			assert.equal(await page.locator(".colony, .district-card").count(), 0);
			await page.locator(".purchase-flow .confirm").click();
			await page.getByRole("button", { name: "Assign operators…", exact: true }).click();
			await page.getByRole("button", { name: "End turn", exact: true }).click();
			const [move] = await page.evaluate(() => bulkMoves);
			assert.equal(move.buys.length, 1);
			assert.equal(move.buys[0].count, expectedCount);
			assert.deepEqual(move.buys[0].cards, kind === "newChemicals" ? [0, 1, 2, 3] : [0]);
			applyMove(state, move, 0);
		}
		assert.deepEqual(errors, []);
		await page.close();
	}
	console.log("Bulk purchases: Mega payments, limits, research requirements and responsive layout passed.");
} finally {
	await browser.close();
	await new Promise((resolve) => server.close(resolve));
}
