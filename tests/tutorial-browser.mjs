import assert from "node:assert/strict";
import { chromium } from "playwright";
import { previewServer } from "./tutorial-preview.mjs";
import { lessons } from "../packages/viewer/src/tutorial/lessons.ts";

const server = previewServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.OUTPOST_CHROMIUM_EXECUTABLE });
try {
	for (const width of [1400, 390]) {
		for (const lesson of lessons) {
			const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: "reduce" });
			const page = await context.newPage();
			const errors = [];
			page.on("pageerror", (error) => errors.push(error.message));
			await page.route(`${base}/host`, (route) =>
				route.fulfill({
					contentType: "text/html",
					body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{width:100%;height:100dvh;border:0;display:block}</style><iframe sandbox="allow-scripts allow-same-origin" src="${base}/?chapter=${lesson.id}"></iframe>`,
				})
			);
			await page.goto(`${base}/host`);
			const frame = page.frameLocator("iframe");
			const root = frame.locator(".outpost-tutorial");
			const guide = frame.locator(".bgs-tutorial-guide");
			const button = (name) => frame.getByRole("button", { name, exact: true });
			const step = (id) => frame.locator(`.outpost-tutorial[data-step="${id}"]`).waitFor();
			const finishTurn = async () => {
				await button("Assign operators…").click();
				await button("End turn").click();
			};
			const purchase = async (name, cost) => {
				await button(name).click();
				await button(`Confirm (◈ ${cost})`).click();
			};
			const doStep = async (entry) => {
				await step(entry.id);
				if (!entry.complete) {
					await guide.getByRole("button", { name: "Continue", exact: true }).click();
				} else if (lesson.choices?.[entry.id]) {
					const answer = lesson.choices[entry.id].find(
						(choice) => !entry.validateMove(lesson.initialState(), { kind: "answer", answer: choice.answer })
					);
					await button(answer.label).click();
				} else if (lesson.watch?.[entry.id]) {
					await button(lesson.watch[entry.id]).click();
				} else if (entry.id === "open") {
					const name = lesson.id === "victory" ? "Ecoplants" : "Heavy Equipment";
					await frame.locator(".market .ucard").filter({ hasText: name }).first().click();
					await button(`Auction at ◈ ${lesson.id === "victory" ? 30 : 25}`).click();
				} else if (entry.id === "raise" || entry.id === "bid") {
					assert.equal(await frame.locator(".actionbar").count(), 0, "No empty panel while bidding");
					await frame.locator('[data-tutorial="auction"].bgs-tutorial-highlight').waitFor();
					if (entry.id === "raise") {
						await frame.getByText("Ada bids 30", { exact: true }).waitFor();
						assert.equal(await frame.getByText("Ada takes part in the sealed auction", { exact: true }).count(), 0);
						await page.screenshot({ path: `/tmp/outpost-open-auction-${width}.png` });
					}
					const amount = entry.id === "raise" ? 31 : 60;
					await frame.getByRole("spinbutton", { name: "Bid before discount" }).fill(String(amount));
					await button(`Bid ◈ ${amount}`).click();
				} else if (entry.id === "pay") {
					await button(`Pay ◈ ${lesson.id === "victory" ? 30 : 31}`).click();
				} else if (entry.id === "build" && lesson.id === "colony") {
					await purchase("Water · ◈ 20", 20);
					await button("Assign operators…").click();
					const colony = frame.locator(".panel.me");
					await colony.locator(".fgroup.res-ore .chip").first().click();
					await colony.locator(".fgroup.res-water .chip:not(.manned)").click();
					await button("End turn").click();
				} else if (entry.id === "assign" || lesson.id === "new-chemicals") {
					await purchase(
						entry.id === "assign" ? "Robot · ◈ 10" : "New Chemicals · ◈ 60",
						entry.id === "assign" ? 10 : 60
					);
					await button("Assign operators…").click();
					const colony = frame.locator(".panel.me");
					const ore = colony.locator(".fgroup.res-ore .chip");
					await ore.nth(0).click();
					if (entry.id === "assign") {
						await ore.nth(1).click();
						await colony.locator(".fgroup.res-titanium .chip:not(.manned)").first().click();
						await colony.locator(".fgroup.res-titanium .chip:not(.manned)").first().click();
					} else {
						await colony.locator(".fgroup.res-newChemicals .chip").click();
					}
					await button("End turn").click();
				} else if (entry.id === "discard") {
					await button("Discard selected").click();
				} else if (entry.id === "mega") {
					await frame.locator(".mega-stepper").getByRole("button", { name: "+", exact: true }).click();
					await button("Take 1 mega").click();
				} else if (entry.id === "finish") {
					await finishTurn();
				} else {
					throw Error(`Missing UI path: ${lesson.id}/${entry.id}`);
				}
			};
			for (const [index, entry] of lesson.steps.entries()) {
				await doStep(entry);
				await step(lesson.steps[index + 1]?.id ?? "complete");
				assert.equal(await frame.locator(".bgs-tutorial-guide [role=alert]").innerText(), "");
				assert.equal(
					await root.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
					false,
					`${lesson.id}/${entry.id} horizontal overflow`
				);
			}
			await page.screenshot({ path: `/tmp/outpost-tutorial-${lesson.id}-${width}.png` });
			await page.reload();
			await step("complete");
			await guide.getByRole("button", { name: "Previous step", exact: true }).click();
			await doStep(lesson.steps.at(-1));
			await step("complete");
			await guide.getByRole("button", { name: "Back to start", exact: true }).click();
			await step("intro");
			await page.screenshot({ path: `/tmp/outpost-tutorial-${lesson.id}-start-${width}.png` });
			assert.deepEqual(errors, []);
			console.log(`${width}px ${lesson.id}: real controls, sandbox, refresh, previous step, restart passed`);
			await context.close();
		}
	}
} finally {
	await browser.close();
	server.close();
}
