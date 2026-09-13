import assert from "node:assert/strict";
import { chromium } from "playwright";
import { initGame } from "../packages/engine/dist/index.js";
import { stripSecret } from "../packages/engine/dist/wrapper.js";

const browser = await chromium.launch({ executablePath: process.env.OUTPOST_CHROMIUM_EXECUTABLE });
try {
	for (const width of [390, 1400]) {
		const page = await browser.newPage({ viewport: { width, height: 950 } });
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.setContent('<div id="app"></div>');
		await page.addStyleTag({ path: "packages/viewer/dist/outpost-viewer.css" });
		await page.addScriptTag({ path: "packages/viewer/dist/outpost-viewer.iife.js" });
		const state = initGame(3, { fastBid: true, kicker: true }, "protocol-smoke");
		state.players.forEach((player, i) => {
			player.name = ["You", "Full Name", "Other"][i];
		});
		await page.evaluate(
			(state) => {
				window.events = [];
				window.emitter = window.outpost.launch("#app");
				for (const name of [
					"ready",
					"move",
					"replaceLog",
					"fetchState",
					"replay:info",
					"player:clicked",
					"chat:read",
					"chat:send",
				]) {
					emitter.on(name, (data) => {
						structuredClone(data);
						events.push({ name, data });
					});
				}
				emitter.emit("player", { index: 0 });
				emitter.emit("preferences", { sound: false });
				emitter.emit("state", state);
				emitter.emit("chat:state", {
					canSend: true,
					mentions: [
						{ id: "u0", name: "You", playerIndex: 0 },
						{ id: "u1", name: "Full Name", playerIndex: 1 },
					],
				});
				emitter.emit(
					"chat:messages",
					Array.from({ length: 35 }, (_, i) => ({
						_id: (i + 1).toString(16).padStart(24, "0"),
						text: `History ${i}`,
						createdAt: new Date(2026, 8, i < 30 ? 12 : 13, 12).toISOString(),
						type: "text",
						author: "Other",
						playerIndex: 2,
					}))
				);
			},
			stripSecret(state, 0)
		);
		await page.waitForFunction(() => events.filter((e) => e.name === "ready").length === 1);
		assert.equal(await page.evaluate(() => outpost.diagnostics().compatible), true);
		assert.equal(
			await page
				.locator(".caption")
				.filter({ hasText: /^Chat$/ })
				.count(),
			1
		);
		if (width === 390) {
			await page.waitForTimeout(650);
			assert.equal(await page.evaluate(() => events.filter((e) => e.name === "chat:read").length), 0);
		}
		assert.deepEqual(await page.locator(".chat-day time").evaluateAll((dates) => dates.map((date) => date.dateTime)), [
			"2026-09-12",
			"2026-09-13",
		]);
		const feed = page.getByRole("region", { name: "Chat messages" });
		await feed.scrollIntoViewIfNeeded();
		await page.waitForFunction(() => events.some((e) => e.name === "chat:read" && e.data.messageId.endsWith("23")));
		const input = page.getByRole("textbox", { name: "Chat message" });
		await input.fill("@");
		assert.equal(await page.locator(".mention-choices").getByRole("button", { name: "@You", exact: true }).count(), 0);
		await input.fill("@F");
		await input.press("Tab");
		await input.pressSequentially("hello");
		assert.equal(await input.inputValue(), '@"Full Name" hello');
		await input.press("Enter");
		const request = await page.evaluate(() => events.findLast((e) => e.name === "chat:send").data);
		assert.equal(request.text, '@"Full Name" hello');
		await page.evaluate(
			(request) => emitter.emit("chat:result", { requestId: request.requestId, ok: false, error: "Rate limited" }),
			request
		);
		assert.equal(await input.inputValue(), '@"Full Name" hello');
		await page.getByRole("alert").filter({ hasText: "Rate limited" }).waitFor();
		await input.fill("Try again");
		await input.press("Enter");
		await input.fill("New draft");
		await page.evaluate(() => {
			const request = events.findLast((e) => e.name === "chat:send").data;
			emitter.emit("chat:result", { requestId: request.requestId, ok: true });
			emitter.emit("chat:appended", [
				{ _id: "000000000000000000000024", type: "text", text: "Try again", playerIndex: 0 },
			]);
		});
		assert.equal(await input.inputValue(), "New draft");
		await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
		await feed.evaluate((el) => {
			el.scrollTop = 0;
			el.dispatchEvent(new Event("scroll"));
		});
		await page.evaluate(() =>
			emitter.emit("chat:appended", [
				{
					_id: "000000000000000000000025",
					type: "text",
					text: "Mention and link",
					playerIndex: 1,
					segments: [
						{ kind: "mention", id: "u1", name: "Full Name" },
						{ kind: "text", text: " <script>bad()</script> " },
						{ kind: "link", url: "https://example.com", text: "Rules" },
					],
				},
			])
		);
		await page.locator(".caption").filter({ hasText: "Chat · 1" }).waitFor();
		assert.equal(await feed.evaluate((el) => el.scrollTop), 0);
		await page.evaluate(() =>
			emitter.emit("chat:appended", [{ _id: "000000000000000000000025", type: "text", text: "Duplicate" }])
		);
		assert.equal(await page.getByText("Duplicate", { exact: true }).count(), 0);
		await feed.evaluate((el) => {
			el.scrollTop = el.scrollHeight;
			el.dispatchEvent(new Event("scroll"));
		});
		await page.waitForFunction(() => events.some((e) => e.name === "chat:read" && e.data.messageId.endsWith("25")));
		await page.locator(".text").getByRole("button", { name: "@Full Name", exact: true }).click();
		assert.equal(await page.evaluate(() => events.findLast((e) => e.name === "player:clicked").data.index), 1);
		assert.equal(await page.getByRole("link", { name: "Rules" }).getAttribute("href"), "https://example.com");
		assert.equal(await feed.locator("script").count(), 0);
		const receipts = await page.evaluate(() => events.filter((e) => e.name === "chat:read").length);
		for (const top of [0, 100000, 0, 100000]) {
			await feed.evaluate((el, top) => {
				el.scrollTop = top;
				el.dispatchEvent(new Event("scroll"));
			}, top);
		}
		await page.waitForTimeout(650);
		assert.equal(await page.evaluate(() => events.filter((e) => e.name === "chat:read").length), receipts);
		await page.evaluate(() => {
			emitter.emit("chat:updated", [{ _id: "000000000000000000000025", type: "text", text: "Edited" }]);
			emitter.emit("chat:deleted", ["000000000000000000000024"]);
			emitter.emit("state:updated");
			emitter.emit("gamelog", { start: 0, data: { log: [] } });
			emitter.emit("replay:start");
			emitter.emit("replay:to", 1);
			emitter.emit("replay:end");
		});
		await page.getByText("Edited", { exact: true }).waitFor();
		assert.equal(await page.evaluate(() => events.filter((e) => e.name === "fetchState").length), 2);
		assert.equal(await page.evaluate(() => events.filter((e) => e.name === "replay:info").length), 2);
		await page.screenshot({ path: `/tmp/outpost-protocol-${width}.png`, fullPage: true });
		await page.evaluate(() => emitter.emit("chat:disabled", true));
		assert.equal(await input.count(), 0);
		await page.evaluate(
			(state) => {
				window.oldEmitter = emitter;
				window.emitter = outpost.launch("#app");
				emitter.emit("state", state);
				emitter.emit("player", { index: 0 });
				oldEmitter.emit("chat:messages", [{ type: "text", text: "Stale chat" }]);
			},
			stripSecret(state, 0)
		);
		await page.locator(".board").waitFor();
		assert.equal(await page.locator(".board").count(), 1);
		assert.equal(await page.getByText("Stale chat", { exact: true }).count(), 0);
		assert.equal(await page.evaluate(() => oldEmitter.emit("state:updated")), false);
		assert.deepEqual(errors, []);
		await page.close();
	}
	console.log("Outpost protocol: mobile/desktop chat, mentions, reads, drafts, replay, refresh and relaunch passed.");
} finally {
	await browser.close();
}
