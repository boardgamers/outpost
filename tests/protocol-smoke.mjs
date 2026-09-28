import { checkHostPresentation } from "./host-presentation-smoke.mjs";
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
					"update:setting",
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
		const autoPass = page.getByRole("switch");
		assert.equal(await autoPass.count(), 0, "wait for the host's settings before showing the control");
		await page.evaluate(() => emitter.emit("settings", { autoPassBids: true }));
		assert.equal(await autoPass.isChecked(), true);
		await autoPass.uncheck();
		assert.deepEqual(await page.evaluate(() => events.filter((e) => e.name === "update:setting")), [
			{ name: "update:setting", data: { name: "autoPassBids", value: false } },
		]);
		await page.evaluate(
			(state) => {
				emitter.emit("settings", { autoPassBids: false });
				emitter.emit("state", { ...state, activeSeat: 1 });
			},
			stripSecret(state, 0)
		);
		assert.equal(await autoPass.isEnabled(), true, "setting remains accessible out of turn");
		await autoPass.check();
		await page.evaluate(
			(state) => {
				emitter.emit("settings", { autoPassBids: true });
				emitter.emit("state", state);
			},
			stripSecret(state, 0)
		);
		assert.equal(await autoPass.isChecked(), true, "a state refresh does not overwrite host settings");
		await page.evaluate(() => emitter.emit("settings", { autoPassBids: false }));
		assert.equal(await autoPass.isChecked(), false, "platform settings update the viewer");
		assert.equal(await page.evaluate(() => events.filter((e) => e.name === "update:setting").length), 2);
		assert.equal(await page.evaluate(() => events.filter((e) => e.name === "move").length), 0);
		await page.evaluate(() => emitter.emit("replay:start"));
		assert.equal(await autoPass.isDisabled(), true);
		await page.evaluate(() => emitter.emit("replay:end"));
		await page.evaluate(() => {
			events = events.filter((e) => e.name !== "replay:info");
		});
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

		await page.evaluate(() => {
			window.translationsRequested = [];
			emitter.on("chat:translate", (request) => {
				translationsRequested.push(request);
				emitter.emit("chat:translation", { ...request, ok: true, text: "Bonjour <img src=x>", language: "en" });
			});
			emitter.emit("chat:state", {
				canSend: true,
				translationTarget: "fr",
				translationLabels: {
					translate: "Traduire",
					translating: "Traduction…",
					translated: "Traduit",
					original: "Voir l’original",
					error: "Indisponible",
					retry: "Réessayer",
				},
			});
			emitter.emit("chat:messages", [{ _id: "000000000000000000000070", type: "text", text: "Hello", language: "en" }]);
		});
		await page.locator(".chat-translate").click();
		await page.getByRole("button", { name: "Traduit · Voir l’original", exact: true }).waitFor();
		assert.equal(await page.evaluate(() => translationsRequested.length), 1);
		assert.equal(await page.locator('[data-message-id="000000000000000000000070"] img').count(), 0);
		assert.match(
			await page.locator('[data-message-id="000000000000000000000070"]').textContent(),
			/Bonjour <img src=x>/
		);
		await page.locator(".chat-translate").click();
		assert.match(await page.locator('[data-message-id="000000000000000000000070"]').textContent(), /Hello/);
		assert.equal(await page.evaluate(() => translationsRequested.length), 1, "showing original needs no new request");
		await page.evaluate(() => emitter.emit("preferences", { sound: false, analysis: true }));
		assert.equal(await autoPass.isDisabled(), true);
		await page.waitForFunction(() => !document.querySelector(".chat-translate")?.getBoundingClientRect().height);
		await page.screenshot({ path: "/tmp/outpost-analysis-" + width + ".png", fullPage: true });
		await page.evaluate(() => emitter.emit("preferences", { sound: false, analysis: false }));
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
		await page.evaluate((state) => {
			emitter.emit("player", {});
			emitter.emit("settings", { autoPassBids: true });
			emitter.emit("state", state);
		}, stripSecret(state));
		assert.equal(await autoPass.count(), 0, "spectators have no personal auction setting");

		await page.locator(".board").evaluate((el) => {
			el.style.display = "none";
		});
		await page.evaluate(() => {
			window.restoredReceipts = [];
			emitter.on("chat:read", (payload) => restoredReceipts.push(payload));
			emitter.emit("chat:state", { canSend: true, readState: { userId: "self", lastReadAt: 500000 } });
			emitter.emit("chat:messages", [
				{ _id: "000001f40000000000000001", type: "text", authorId: "other", text: "Already read" },
				{ _id: "000001f50000000000000001", type: "text", authorId: "other", text: "Unread after reload" },
				{ _id: "000001f60000000000000001", type: "text", authorId: "self", text: "My own message" },
				{ _id: "000001f70000000000000001", type: "system", text: "Game started" },
			]);
		});
		await page.waitForFunction(() => document.querySelector(".chat .caption")?.textContent === "Chat · 1");
		await page.waitForTimeout(650);
		assert.equal(await page.evaluate(() => restoredReceipts.length), 0, "hidden chat preserves unread history");
		await page.locator(".board").evaluate((el) => {
			el.style.display = "";
		});
		await page.getByRole("region", { name: "Chat messages" }).scrollIntoViewIfNeeded();
		await page.waitForFunction(() => restoredReceipts.length > 0);
		assert.equal(await page.locator(".chat .caption").textContent(), "Chat", "opening chat clears restored unread");
		const stacks = page.locator(".hcount");
		assert.ok((await stacks.count()) > 0, "opponent hands show resource stacks");
		assert.equal(
			await stacks.locator(".res-icon").count(),
			await stacks.count(),
			"every stack identifies its resource without color"
		);
		for (const stack of await stacks.all()) {
			const count = Number((await stack.textContent()).trim());
			assert.match(await stack.getAttribute("title"), new RegExp(`cards: ${count}$`));
		}
		await page.screenshot({ path: `/tmp/outpost-resource-icons-${width}.png`, fullPage: true });
		await checkHostPresentation(page, "emitter", `/tmp/outpost-board-thumbnail-${width}.png`);
		assert.deepEqual(errors, []);
		await page.close();
	}
	console.log("Outpost protocol: mobile/desktop chat, mentions, reads, drafts, replay, refresh and relaunch passed.");
} finally {
	await browser.close();
}
