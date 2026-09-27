import assert from "node:assert/strict";
import { chromium } from "playwright";
import { initGame } from "../packages/engine/dist/index.js";
import { stripSecret } from "../packages/engine/dist/wrapper.js";

const browser = await chromium.launch({ headless: true });
try {
	const configurations = [
		{ width: 320, height: 568 },
		{ width: 390, height: 844 },
		{ width: 844, height: 393 },
	].flatMap((viewport) => [false, true].map((embedded) => ({ viewport, embedded })));
	await Promise.all(
		configurations.map(async ({ viewport, embedded }) => {
			const page = await browser.newPage({ viewport, isMobile: true, hasTouch: true });
			const errors = [];
			page.on("pageerror", (error) => errors.push(error.message));
			const markup =
				'<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><div id="app"></div>';
			let frame = page;
			if (embedded) {
				await page.setContent(
					'<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}iframe{width:100%;border:0;display:block}</style><iframe></iframe><footer style="height:600px"></footer>'
				);
				frame = page.frames()[1];
				await frame.setContent(markup);
			} else {
				await page.setContent(`${markup}<footer style="height:600px"></footer>`);
			}
			await frame.addStyleTag({ path: "packages/viewer/dist/outpost-viewer.css" });
			await frame.addScriptTag({ path: "packages/viewer/dist/outpost-viewer.iife.js" });
			const state = initGame(3, { fastBid: true, kicker: true }, "protocol-smoke");
			await frame.evaluate(
				(state) => {
					window.moves = [];
					window.emitter = outpost.launch("#app");
					emitter.on("move", (move) => moves.push(move));
					emitter.emit("player", { index: 0 });
					emitter.emit("preferences", { sound: false });
					emitter.emit("state", state);
					emitter.emit("chat:state", { canSend: true });
					emitter.emit(
						"chat:messages",
						Array.from({ length: 60 }, (_, i) => ({
							_id: (i + 1).toString(16).padStart(24, "0"),
							text: `Message ${i} about the ongoing game`,
							type: "text",
							author: "Other",
							playerIndex: 1,
						}))
					);
					emitter.emit("gamelog", {
						start: state.log.length,
						data: {
							log: Array.from({ length: 80 }, () => ({
								type: "move",
								player: 1,
								move: { action: "bid", amount: 30 },
							})),
						},
					});
				},
				stripSecret(state, 0)
			);
			await frame.locator(".actionbar button:disabled").first().waitFor({ state: "visible" });
			if (embedded) {
				await frame.evaluate(() => {
					const resize = () => {
						window.frameElement.style.height = `${document.body.scrollHeight}px`;
					};
					new ResizeObserver(resize).observe(document.body);
					resize();
				});
			}
			const cdp = await page.context().newCDPSession(page);
			async function swipe(locator, deltaY, deltaX = 0) {
				const bounds = await locator.boundingBox();
				assert.ok(bounds);
				const x = bounds.x + bounds.width / 2;
				const y = bounds.y + bounds.height / 2;
				assert.ok(y > 0 && y < viewport.height, `Touch target is visible: ${y}`);
				await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
				for (let i = 1; i <= 12; i++) {
					await cdp.send("Input.dispatchTouchEvent", {
						type: "touchMove",
						touchPoints: [{ x: x + (deltaX * i) / 12, y: y + (deltaY * i) / 12 }],
					});
					await page.waitForTimeout(20);
				}
				await page.waitForTimeout(100);
				await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
				await page.waitForTimeout(180);
			}
			async function center(locator) {
				await locator.evaluate((el) => el.scrollIntoView({ block: "center" }));
				await page.waitForTimeout(100);
			}
			async function pageScrollsFrom(locator, label) {
				await center(locator);
				const before = await page.evaluate(() => scrollY);
				await swipe(locator, -100);
				assert.ok((await page.evaluate(() => scrollY)) > before + 40, `${label}: page scrolls`);
				assert.equal(await frame.evaluate(() => moves.length), 0, `${label}: swipe does not play`);
			}
			await pageScrollsFrom(frame.locator(".factory-buttons button:not(:disabled)").last(), "enabled buy button");
			const disabled = frame.locator(".factory-buttons button:disabled").first();
			await pageScrollsFrom(disabled, "disabled buy button");
			await center(disabled);
			const disabledBounds = await disabled.boundingBox();
			await page.touchscreen.tap(
				disabledBounds.x + disabledBounds.width / 2,
				disabledBounds.y + disabledBounds.height / 2
			);
			assert.equal(await frame.locator(".factory-buttons").count(), 1, "disabled tap does not open a purchase");
			await pageScrollsFrom(frame.locator(".me .pcard").first(), "hand card");
			await pageScrollsFrom(frame.locator(".market .ucard").first(), "market card");
			await pageScrollsFrom(frame.locator(".factory-buttons button:not(:disabled) svg").first(), "resource icon");
			await frame.evaluate(() => emitter.emit("player", { index: 1 }));
			await pageScrollsFrom(frame.locator(".market .ucard:disabled").first(), "disabled market card");
			await pageScrollsFrom(frame.locator(".pcard:disabled").first(), "disabled hand card");
			await frame.evaluate(() => emitter.emit("player", { index: 0 }));
			for (const name of ["Chat messages", "Recent events"]) {
				const feed = frame.getByRole("region", { name, exact: true });
				await center(feed);
				await feed.evaluate((el) => {
					el.scrollTop = el.scrollHeight;
				});
				await page.waitForTimeout(100);
				const bottom = await feed.evaluate((el) => el.scrollTop);
				const bounds = await feed.boundingBox();
				await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
				await page.mouse.wheel(0, -8);
				await page.waitForTimeout(100);
				assert.ok((await feed.evaluate((el) => el.scrollTop)) < bottom - 3, `${name}: small wheel escapes following`);
				await feed.evaluate((el) => {
					el.scrollTop = 300;
				});
				await page.waitForTimeout(100);
				const outer = await page.evaluate(() => scrollY);
				await swipe(feed, -70);
				assert.ok((await feed.evaluate((el) => el.scrollTop)) > 330, `${name}: scrolls internally`);
				assert.ok(
					Math.abs((await page.evaluate(() => scrollY)) - outer) < 3,
					`${name}: internal gesture stays in feed`
				);
				await feed.evaluate((el) => {
					el.scrollTop = 60;
				});
				await page.waitForTimeout(80);
				await swipe(feed, 100);
				assert.equal(await feed.evaluate((el) => el.scrollTop), 0, `${name}: touch reaches the top`);
				const beforeTop = await page.evaluate(() => scrollY);
				await swipe(feed, 70);
				assert.ok((await page.evaluate(() => scrollY)) < beforeTop - 30, `${name}: top edge releases to page`);
				await center(feed);
				await feed.evaluate((el) => {
					el.scrollTop = el.scrollHeight - el.clientHeight - 60;
				});
				await page.waitForTimeout(80);
				await swipe(feed, -100);
				assert.ok(
					await feed.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop < 1),
					`${name}: touch reaches the bottom`
				);
				const beforeBottom = await page.evaluate(() => scrollY);
				await swipe(feed, -70);
				assert.ok((await page.evaluate(() => scrollY)) > beforeBottom + 30, `${name}: bottom edge releases to page`);
			}
			await frame.evaluate(() => emitter.emit("replay:start"));
			const marks = frame.locator(".marks");
			await center(marks);
			await swipe(marks, 0, -85);
			assert.ok((await marks.evaluate((el) => el.scrollLeft)) > 30, "replay timeline still scrolls horizontally");
			await pageScrollsFrom(marks, "replay timeline vertical gesture");
			await frame.evaluate(() => emitter.emit("replay:end"));
			await frame.locator(".factory-buttons button:not(:disabled)").last().tap();
			assert.equal(await frame.locator(".factory-buttons").count(), 0, "a tap still opens a purchase");
			await pageScrollsFrom(frame.locator(".actionbar button:disabled").first(), "disabled payment confirmation");
			assert.equal(
				await frame.evaluate(() => document.documentElement.scrollWidth > innerWidth),
				false,
				"no horizontal page overflow"
			);
			assert.deepEqual(errors, []);
			console.log(
				`Outpost touch scrolling: ${viewport.width}×${viewport.height}, ${embedded ? "auto-height iframe" : "standalone"} passed`
			);
			await page.close();
		})
	);
} finally {
	await browser.close();
}
