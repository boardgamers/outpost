import { maxBid } from "./state.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createAnalysisScenario, init, currentPlayer, moveAI, move } from "../wrapper.js";

test("analysis uses observed production and independent randomness", async () => {
	const state = await init(3, ["kicker"], {}, "real-secret");
	const original = structuredClone(state);
	const changed = structuredClone(state);
	changed.seed = "other-secret";
	changed.rngCounter = 555;
	changed.messages = ["private"];
	changed.log = [];
	for (const p of changed.players.slice(1)) {
		for (const c of p.hand) {
			c.v = 999;
		}
	}
	for (const deck of Object.values(changed.decks)) {
		deck.fill(999);
	}
	const scenario = createAnalysisScenario(state, { player: 0, seed: "simulation" });
	assert.deepEqual(scenario, createAnalysisScenario(changed, { player: 0, seed: "simulation" }));
	assert.deepEqual(state, original);
	assert.deepEqual(scenario.players[0]!.hand, state.players[0]!.hand);
	assert.notDeepEqual(scenario, createAnalysisScenario(state, { player: 0, seed: "other" }));
	assert.ok(!JSON.stringify(scenario).includes("real-secret"));
	for (let i = 0; i < 200 && !scenario.ended; i++) {
		const current = currentPlayer(scenario);
		await moveAI(scenario, Array.isArray(current) ? current[0]! : current!);
	}
	assert.ok(scenario.round > state.round);
});

test("observer, blind mega production, and parked exchanges never copy unknown values", async () => {
	const s = await init(3, [], {}, "private");
	s.phase = "mega";
	s.players[0]!.pendingMega = [{ t: "ore", v: s.decks.ore.pop()! }];
	s.exchange = { seat: 1, acted: [0], parked: [{ seat: 0, card: { t: "water", v: s.decks.water.pop()! } }] };
	const changed = structuredClone(s);
	changed.players[0]!.pendingMega![0]!.v = 987;
	changed.exchange!.parked[0]!.card.v = 876;
	for (const player of [undefined, 0]) {
		assert.deepEqual(
			createAnalysisScenario(s, { player, seed: "same" }),
			createAnalysisScenario(changed, { player, seed: "same" })
		);
	}
	const observer = createAnalysisScenario(s, { seed: "same" });
	const alternate = structuredClone(s);
	for (const p of alternate.players) {
		for (const c of p.hand) {
			c.v = 987;
		}
	}
	assert.deepEqual(observer, createAnalysisScenario(alternate, { seed: "same" }));
});

test("sealed auction scenario replaces the secret opening bid and remains payable", async () => {
	const s = await init(3, [], { fastBid: true }, "private");
	s.phase = "auction";
	s.auction = {
		marketIndex: 0,
		upgrade: "dataLibrary",
		auctioneer: 1,
		highBid: 15,
		highBidder: 1,
		passed: [],
		activeBidder: 1,
		bids: { 1: 15 },
	};
	const changed = structuredClone(s);
	changed.auction!.highBid = 999;
	changed.auction!.bids![1] = 999;
	const a = createAnalysisScenario(s, { player: 0, seed: "same" });
	assert.deepEqual(a, createAnalysisScenario(changed, { player: 0, seed: "same" }));
	assert.equal(a.auction!.highBid, a.auction!.bids![1]);
	assert.ok(a.players[1]!.hand.reduce((sum, c) => sum + c.v, 0) >= a.auction!.highBid);
});

test("revealed sealed bids constrain every simulated hand and survive resampling", async () => {
	const s = await init(3, [], { fastBid: true }, "seed0");
	await move(s, { action: "auction", marketIndex: s.market.indexOf("dataLibrary"), bid: 15 }, 0);
	await move(s, { action: "bid", amount: maxBid(s, 1, "dataLibrary") }, 1);
	await move(s, { action: "bid", amount: maxBid(s, 2, "dataLibrary") }, 2);
	assert.equal(s.phase, "auctionPayment");
	const a = createAnalysisScenario(s, { seed: "fake1" });
	for (const candidate of [a, createAnalysisScenario(a, { seed: "reroll" })]) {
		for (const [seat, amount] of Object.entries(candidate.auction!.bids!)) {
			assert.ok(maxBid(candidate, Number(seat), "dataLibrary") >= amount);
		}
	}
});

test("completed exchanges retain the lowest-higher-card inference across resampling", async () => {
	const source = await init(3, ["kicker"], {}, "0");
	for (let i = 0; i < 15; i++) {
		const active = currentPlayer(source);
		await moveAI(source, Array.isArray(active) ? active[0]! : active!);
	}
	const entry = source.log.at(-1)!;
	assert.equal(entry.type, "move");
	if (entry.type !== "move" || entry.move.action !== "exchange") {
		assert.fail("Expected exchange fixture");
	}
	assert.equal(entry.info!.exchangeGiven!.v, 3);
	assert.equal(entry.info!.exchangeValue, 5);
	const target = entry.move.target;
	const scenario = createAnalysisScenario(source, { player: entry.player, seed: "known-exchange" });
	for (let i = 0; i < 10; i++) {
		const sample = createAnalysisScenario(scenario, { player: entry.player, seed: String(i) });
		assert.ok(sample.players[target]!.hand.some((card) => card.t === "ore" && card.v === 3));
		assert.ok(sample.players[target]!.hand.every((card) => card.t !== "ore" || card.v !== 4));
	}
});

test("bounced exchanges constrain the target's retained resource values", async () => {
	const source = await init(3, ["kicker"], {}, "0");
	for (let i = 0; i < 14; i++) {
		const active = currentPlayer(source);
		await moveAI(source, Array.isArray(active) ? active[0]! : active!);
	}
	assert.equal(source.exchange!.seat, 2);
	await move(source, { action: "exchange", card: 2, target: 0 }, 2);
	const entry = source.log.at(-1)!;
	assert.ok(entry.type === "move" && entry.info!.exchangeTake === -1);
	const scenario = createAnalysisScenario(source, { player: 2, seed: "bounce" });
	for (let i = 0; i < 5; i++) {
		const sample = createAnalysisScenario(scenario, { player: 2, seed: String(i) });
		assert.ok(sample.players[0]!.hand.every((card) => card.t !== "water" || card.v <= 9));
	}
});
