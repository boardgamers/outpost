import assert from "node:assert/strict";
import { chromium } from "playwright";
import { previewServer } from "./tutorial-preview.mjs";
import { applyMove, chooseMove, initGame } from "../packages/engine/dist/index.js";
import { currentPlayer, stripSecret } from "../packages/engine/dist/wrapper.js";

const hand = [
	{ t: "ore", v: 5 },
	{ t: "ore", v: 6 },
	{ t: "water", v: 12 },
	{ t: "water", v: 9 },
];
const earlier = initGame(3, {}, "undo-browser");
let later = structuredClone(earlier);
do {
	const current = currentPlayer(later);
	const seat = Array.isArray(current) ? current[0] : current;
	later = applyMove(later, chooseMove(later, seat), seat);
} while (!(later.phase === "actions" && later.activeSeat === 0 && later.round > earlier.round));
// The same hand in both positions, so purchases staged later would still be payable after an undo.
earlier.players[0].hand = structuredClone(hand);
later.players[0].hand = structuredClone(hand);

const mega = initGame(3, {}, "undo-browser");
mega.phase = "mega";
mega.players[0].pendingMega = [9, 10, 11, 12].map((v) => ({ t: "water", v }));
mega.players[0].megaGroups = { water: 1 };
const megaChosen = applyMove(structuredClone(mega), { action: "mega", take: { water: 1 } }, 0);

async function launch(page, settings) {
	await page.evaluate((settings) => {
		window.emitter = outpost.launch("#app");
		window.undoRequests = 0;
		window.sentMoves = [];
		emitter.on("undo", () => undoRequests++);
		emitter.on("move", (move) => sentMoves.push(move));
		emitter.emit("preferences", { sound: false });
		emitter.emit("player", { index: 0 });
		emitter.emit("settings", settings);
	}, settings);
}

async function show(page, state, seat = 0) {
	await page.evaluate((state) => emitter.emit("state", state), stripSecret(state, seat));
	const strip = page.locator(".strip");
	await strip.getByText(`Round ${state.round}`, { exact: true }).waitFor();
	await strip
		.getByText(state.ended ? "Game over" : state.phase === "mega" ? "Production" : "Actions", { exact: true })
		.waitFor();
}

async function checkUndoControl(page) {
	await launch(page, { autoPassBids: false, autoMega: "ask" });
	await show(page, later);
	const undo = page.getByRole("button", { name: "Undo my move", exact: true });
	const strip = page.locator(".strip");
	const stripHeight = (await strip.boundingBox()).height;
	assert.equal(await undo.count(), 0, "hidden until BGS offers undo");
	await page.evaluate(() => emitter.emit("undo:available", true));
	await undo.waitFor();
	assert.equal(await undo.getAttribute("title"), "Undo my move");
	assert.equal((await strip.boundingBox()).height, stripHeight, "the header keeps its height");
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

	await page.locator(".buy.res-ore").click();
	await page.locator(".purchase-flow .confirm").click();
	await page.getByText(/Staged this turn: 1 Ore factory/).waitFor();
	await page.locator(".buy.res-water").click();
	assert.equal(await page.locator(".pcard.selected").count(), 2);
	await undo.click();
	assert.equal(await page.evaluate(() => undoRequests), 1);
	assert.deepEqual(await page.evaluate(() => sentMoves), []);

	await show(page, earlier);
	assert.equal(
		await page.getByText(/Staged this turn/).count(),
		0,
		"purchases staged after the undone move are dropped"
	);
	assert.equal(await page.locator(".purchase-flow").count(), 0);
	assert.equal(await page.locator(".pcard.selected").count(), 0);
	assert.equal(await page.locator(".actionbar .cash").textContent(), "◈ 32");
	assert.equal(await undo.count(), 1, "earlier moves can be taken back too");

	await page.evaluate(() => emitter.emit("replay:start"));
	await undo.waitFor({ state: "hidden" });
	await page.evaluate(() => emitter.emit("replay:end"));
	await undo.waitFor();
	await page.evaluate(() => emitter.emit("preferences", { sound: false, analysis: true }));
	await undo.waitFor({ state: "hidden" });
	await page.evaluate(() => emitter.emit("preferences", { sound: false }));
	await undo.waitFor();

	await page.getByRole("button", { name: "Assign operators…", exact: true }).click();
	await page.getByRole("button", { name: "End turn", exact: true }).click();
	const [move] = await page.evaluate(() => sentMoves);
	assert.equal(move.action, "endTurn");
	await undo.waitFor({ state: "hidden" });
	await page.evaluate((move) => emitter.emit("move:result", { move, ok: true }), move);
	await undo.waitFor();

	await page.evaluate(() => emitter.emit("player", {}));
	await show(page, later, -1);
	assert.equal(await undo.count(), 0, "spectators cannot undo");
	await page.evaluate(() => emitter.emit("player", { index: 0 }));
	await show(page, { ...later, ended: true });
	assert.equal(await undo.count(), 0, "hidden once the game is over");
	await show(page, later);
	await undo.waitFor();

	await page.evaluate(() => emitter.emit("preferences", { locale: "fr", sound: false }));
	await page.locator('.undo-move[title="Annuler mon coup"][aria-label="Annuler mon coup"]').waitFor();
	await page.evaluate(() => emitter.emit("preferences", { locale: "en", sound: false }));
	await undo.waitFor();
	await page.evaluate(() => emitter.emit("undo:available", false));
	await undo.waitFor({ state: "hidden" });
	assert.equal(await page.evaluate(() => undoRequests), 1);
}

async function checkAutomaticChoiceAfterUndo(page) {
	const automatic = { autoPassBids: false, autoMega: "maximum" };
	await launch(page, automatic);
	await page.evaluate((state) => emitter.emit("state", state), stripSecret(mega, 0));
	await page.waitForFunction(() => sentMoves.length === 1);
	assert.deepEqual(await page.evaluate(() => sentMoves), [{ action: "mega", take: { water: 1 } }]);

	await launch(page, automatic);
	await page.evaluate(() => emitter.emit("undo:available", true));
	await show(page, megaChosen);
	await show(page, mega);
	await page.getByRole("button", { name: "Take all as singles", exact: true }).waitFor();
	await page.waitForTimeout(300);
	assert.deepEqual(await page.evaluate(() => sentMoves), [], "the undone production choice is not submitted again");
}

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
		await checkUndoControl(page);
		await checkAutomaticChoiceAfterUndo(page);
		assert.deepEqual(errors, []);
		await page.close();
	}
	console.log("Undo: availability, replay/analysis/spectator/pending visibility and rewound positions passed.");
} finally {
	await browser.close();
	await new Promise((resolve) => server.close(resolve));
}
