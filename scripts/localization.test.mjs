import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../packages/viewer/src/localization/runtime.js", import.meta.url), "utf8");
const { createTranslator, resolveLocale } = await import(
	"data:text/javascript;base64," + Buffer.from(source).toString("base64")
);
const catalogs = {
	nl: {
		Draw: "Tekenen",
		"Your cash: $": "Je geld: $",
		Ore: "Erts",
		east: "oost",
		"{p0} · ◈ {p1}": "{p0} · ◈ {p1}",
		Round: "Ronde",
		"Build {p0} for {p1}": "Bouw voor {p1}: {p0}",
		"{p0} buys {p1}": "{p0} koopt {p1}",
		"Make money by trading": "Verdien geld door te handelen",
		"Gain {p0} points{p1}": "Krijg {p0} punten{p1}",
	},
	fr: { Round: "Manche" },
};
test("regional language preferences select supported catalogues", () => {
	assert.equal(resolveLocale("nl-BE"), "nl");
	assert.equal(resolveLocale("pt-PT"), "pt-BR");
	assert.equal(resolveLocale("zh-Hant-TW"), "zh-TW");
	assert.equal(resolveLocale("zh-CN"), "en");
	assert.equal(resolveLocale(undefined), "en");
});
test("dynamic values are reordered while player names stay unchanged", () => {
	const t = createTranslator(catalogs, "nl");
	t.setNames(["Draw"]);
	assert.equal(t.translate("Draw buys 3"), "Draw koopt 3");
	assert.equal(t.translate("Build 2 for 10"), "Bouw voor 10: 2");
	assert.equal(t.translate("Draw"), "Draw");
	assert.equal(t.translate("Gain 2 points"), "Krijg 2 punten");
});
test("tutorial numbering and whitespace survive translation", () => {
	const t = createTranslator(catalogs, "nl");
	assert.equal(t.translate("  1/5 · Make money by trading\n"), "  1/5 · Verdien geld door te handelen\n");
	assert.equal(t.translate("Round 2"), "Ronde 2");
	assert.equal(t.translate("Unknown sentence"), "Unknown sentence");
});
test("language changes clear caches and preserve the English fallback", () => {
	const t = createTranslator(catalogs, "nl");
	assert.equal(t.translate("Round"), "Ronde");
	t.setLocale("fr");
	assert.equal(t.translate("Round"), "Manche");
	t.setLocale("en");
	assert.equal(t.translate("Round"), "Round");
});

test("icon-separated values and uppercase labels are localized", () => {
	const t = createTranslator(catalogs, "nl");
	assert.equal(t.translate("Ore · ◈ 10"), "Erts · ◈ 10");
	assert.equal(t.translate("EAST"), "OOST");
});

test("decorative arrows and attached currency values keep their meaning", () => {
	const t = createTranslator(catalogs, "nl");
	assert.equal(t.translate("Draw →"), "Tekenen →");
	assert.equal(t.translate("Your cash: $20"), "Je geld: $20");
});

test("complete card effects preserve icons and allow localized word order", async () => {
	const { localizeEffect } = await import("../packages/viewer/src/lib/localized-effect.ts");
	const locales = ["en", "fr", "de", "nl", "da", "pl", "ro", "el", "hi", "ru", "pt-BR", "ko", "zh-TW", "vi", "it"];
	const actual = Object.fromEntries(
		await Promise.all(
			locales.map(async (locale) => [
				locale,
				JSON.parse(
					await readFile(new URL(`../packages/viewer/src/localization/${locale}.json`, import.meta.url), "utf8")
				),
			])
		)
	);
	const robot = { u: "robots" },
		card = { card: "ore" },
		factories = { f: "ore", n: 2 };
	const tokens = ["−5 on ", robot, " bids. Draw 1 extra ", card, " per ", factories, "."];
	for (const locale of locales) {
		const translator = createTranslator(actual, locale);
		const result = localizeEffect(tokens, (source) => translator.translate(source));
		assert.equal(result.filter((token) => typeof token !== "string").length, 3);
		for (const icon of [robot, card, factories]) {
			assert.ok(result.includes(icon));
		}
		assert.ok(!result.some((token) => typeof token === "string" && /\{p\d+\}/.test(token)), locale);
		if (locale !== "en") {
			assert.notEqual(result.join(""), tokens.join(""), locale);
		}
	}
	const hindi = createTranslator(actual, "hi");
	const reordered = localizeEffect(tokens, (source) => hindi.translate(source));
	assert.ok(reordered.indexOf(factories) < reordered.indexOf(card));
	const research = { card: "research" };
	const german = createTranslator(actual, "de");
	const produced = localizeEffect(["Produces a ", research, " (6–10) each round (per copy)."], (source) =>
		german.translate(source)
	);
	assert.ok(produced.includes(research));
	assert.ok(produced.includes("6–10"));
	assert.ok(produced.join("").includes("pro Exemplar"));
});

test("colony ship lists translate each upgrade without rewriting player names", async () => {
	const actual = Object.fromEntries(
		await Promise.all(
			["en", "zh-TW", "fr"].map(async (locale) => [
				locale,
				JSON.parse(
					await readFile(new URL(`../packages/viewer/src/localization/${locale}.json`, import.meta.url), "utf8")
				),
			])
		)
	);
	const t = createTranslator(actual, "zh-TW");
	t.setNames(["Heavy Equipment", "Heavy Equipment, Data Library"]);
	const actions = t.translate(
		"Heavy Equipment builds 2 water factories, recruits 1 colonist(s) (paid 25) and mans 3 factories"
	);
	assert.ok(!actions.includes("builds"), actions);
	assert.ok(!actions.includes("recruits"), actions);
	assert.ok(actions.includes("Heavy Equipment"), actions);
	const input = "Round 1: colony ship arrives: Heavy Equipment, Nodule, Data Library";
	const translated = t.translate(input);
	assert.ok(translated.includes(actual["zh-TW"]["Heavy Equipment"]));
	assert.ok(translated.includes(actual["zh-TW"]["Data Library"]));
	assert.equal(t.translate("Heavy Equipment, Data Library"), "Heavy Equipment, Data Library");
	assert.equal(
		t.translate("Heavy Equipment bids 25"),
		actual["zh-TW"]["{p0} bids {p1}"].replace("{p0}", "Heavy Equipment").replace("{p1}", "25")
	);
	t.setLocale("fr");
	assert.ok(t.translate(input).includes(actual.fr["Heavy Equipment"]));
	t.setLocale("en");
	assert.equal(t.translate(input), input);
});

test("Persian regional tags select Farsi", () => {
	assert.equal(resolveLocale("fa-IR"), "fa");
	assert.equal(resolveLocale("fa_IR"), "fa");
});
