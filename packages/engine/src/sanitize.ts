import { FACTORY_TYPES } from "./types.js";
import type { FactoryType, Move } from "./types.js";

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

export function sanitizeMove(raw: unknown): Move {
	const move = record(raw);
	const action = move.action;
	if (typeof action !== "string") {
		fail("missing action");
	}
	switch (action) {
		case "discard":
			return { action, cards: intArray(move.cards, "cards") };
		case "auction":
			return {
				action,
				marketIndex: int(move.marketIndex, "marketIndex", 0),
				bid: int(move.bid, "bid", 0),
			};
		case "bid":
			return { action, amount: int(move.amount, "amount", 0) };
		case "bidPass":
			return { action };
		case "pay":
			return { action, cards: intArray(move.cards, "cards") };
		case "buyFactory": {
			const factory = move.factory;
			if (typeof factory !== "string" || !FACTORY_TYPES.includes(factory as FactoryType)) {
				fail("unknown factory type");
			}
			return { action, factory: factory as FactoryType, cards: intArray(move.cards, "cards") };
		}
		case "buyPopulation":
			return { action, count: int(move.count, "count", 1, 100), cards: intArray(move.cards, "cards") };
		case "buyRobots":
			return { action, count: int(move.count, "count", 1, 100), cards: intArray(move.cards, "cards") };
		case "endTurn":
			return { action, manned: intArray(move.manned, "manned") };
		default:
			fail(`unknown action ${action}`);
	}
}
