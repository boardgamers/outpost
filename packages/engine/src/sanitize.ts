import { FACTORY_TYPES } from "./types.js";
import type { FactoryType, Move, TurnBuy } from "./types.js";

// Moves arrive as untrusted JSON from the network and are stored verbatim in
// the game log. Rebuild every move as a fresh literal with exactly the
// whitelisted fields: unknown keys (including __proto__ tricks) are dropped,
// values are strictly type-checked, and array sizes are bounded.

const MAX_ARRAY = 200;

function fail(message: string): never {
	throw new Error(`invalid move: ${message}`);
}

function record(raw: unknown): Record<string, unknown> {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		fail("expected an object");
	}
	return raw as Record<string, unknown>;
}

function int(value: unknown, label: string, min: number, max = 1_000_000): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
		fail(`${label} must be an integer in [${min}, ${max}]`);
	}
	return value;
}

function intArray(value: unknown, label: string): number[] {
	if (!Array.isArray(value)) {
		fail(`${label} must be an array`);
	}
	if (value.length > MAX_ARRAY) {
		fail(`${label} is too large`);
	}
	return value.map((v) => int(v, `${label} entry`, 0, 10_000));
}

const MAX_BUYS = 50;

function buyArray(value: unknown): TurnBuy[] {
	if (value === undefined) {
		return [];
	}
	if (!Array.isArray(value)) {
		fail("buys must be an array");
	}
	if (value.length > MAX_BUYS) {
		fail("buys is too large");
	}
	return value.map((raw): TurnBuy => {
		const entry = record(raw);
		switch (entry.buy) {
			case "factory": {
				const factory = entry.factory;
				if (typeof factory !== "string" || !FACTORY_TYPES.includes(factory as FactoryType)) {
					fail("unknown factory type");
				}
				return { buy: "factory", factory: factory as FactoryType, cards: intArray(entry.cards, "cards") };
			}
			case "population":
				return { buy: "population", count: int(entry.count, "count", 1, 100), cards: intArray(entry.cards, "cards") };
			case "robots":
				return { buy: "robots", count: int(entry.count, "count", 1, 100), cards: intArray(entry.cards, "cards") };
			default:
				fail("unknown buy kind");
		}
	});
}

export function sanitizeMove(raw: unknown): Move {
	const move = record(raw);
	const action = move.action;
	if (typeof action !== "string") {
		fail("missing action");
	}
	switch (action) {
		case "mega":
			return { action, cards: intArray(move.cards, "cards") };
		case "discard":
			return { action, cards: intArray(move.cards, "cards") };
		case "auction":
			return {
				action,
				marketIndex: int(move.marketIndex, "marketIndex", 0),
				bid: int(move.bid, "bid", 0),
				...(move.kicker === true ? { kicker: true } : {}),
			};
		case "bid":
			// -1 is the masked value of another player's sealed bid in a stripped
			// log (fastBid); the live game never sends it, replay does.
			return { action, amount: int(move.amount, "amount", -1) };
		case "bidPass":
			return { action };
		case "pay":
			return { action, cards: intArray(move.cards, "cards") };
		case "endTurn":
			return { action, buys: buyArray(move.buys), manned: intArray(move.manned, "manned") };
		default:
			fail(`unknown action ${action}`);
	}
}
