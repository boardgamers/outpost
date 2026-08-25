import {
	BASE_HAND_CAPACITY,
	BASE_POPULATION_MAX,
	CAP_EXEMPT,
	FACTORIES,
	FIRST_TEN,
	LAST_THREE,
	MAX_CARD_VALUE,
	MAX_PLAYERS,
	MIN_CARD_VALUE,
	MIN_PLAYERS,
	POPULATION_COST,
	POPULATION_COST_ECOPLANTS,
	PRODUCTION_DECKS,
	SETUP_CHART,
	UPGRADE_SPECS,
} from "./data.js";
import { nextInt, shuffle } from "./prng.js";
import { RESOURCES, UPGRADES } from "./types.js";
import type { FactoryType, GameState, PlayerState, Resource, Upgrade } from "./types.js";

export function setup(players: number, options: Record<string, unknown>, seed: string): GameState {
	if (!Number.isInteger(players) || players < MIN_PLAYERS || players > MAX_PLAYERS) {
		throw new Error(`Outpost supports ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
	}

	const state: GameState = {
		players: Array.from({ length: players }, (_, i) => createPlayer(i)),
		round: 0,
		phase: "actions",
		purchaseOrder: [],
		activeSeat: 0,
		auction: null,
		market: [],
		supply: createSupply(players),
		decks: emptyPiles(),
		discards: emptyPiles(),
		seed,
		rngCounter: 0,
		options: options ?? {},
		log: [{ type: "init", players, seed, options: options ?? {} }],
		moveCount: 0,
		ended: false,
		messages: [],
	};

	if (players === 2) {
		rollTwoPlayerSupply(state);
	}

	for (const resource of RESOURCES) {
		state.decks[resource] = buildDeck(state, resource);
	}

	return state;
}

function createPlayer(index: number): PlayerState {
	const upgrades = {} as Record<Upgrade, number>;
	for (const u of UPGRADES) {
		upgrades[u] = 0;
	}
	return {
		name: `Player ${index + 1}`,
		factories: [
			{ type: "ore", manned: true },
			{ type: "ore", manned: true },
			{ type: "water", manned: true },
		],
		population: 3,
		robots: 0,
		hand: [],
		upgrades,
		spent: 0,
		done: false,
		mustDiscard: false,
		dropped: false,
		settings: {},
	};
}

function emptyPiles(): Record<Resource, number[]> {
	const piles = {} as Record<Resource, number[]>;
	for (const r of RESOURCES) {
		piles[r] = [];
	}
	return piles;
}

function createSupply(players: number): Record<Upgrade, number> {
	const row = SETUP_CHART[Math.min(players, 10)];
	const supply = {} as Record<Upgrade, number>;
	for (const u of FIRST_TEN) {
		supply[u] = row?.firstTen ?? 3;
	}
	for (const u of LAST_THREE) {
		supply[u] = row?.lastThree ?? 3;
	}
	return supply;
}

/** 2-player setup: roll per type (even: 2 copies, odd: 1), reroll until 4-10 types have 2 copies. */
function rollTwoPlayerSupply(state: GameState): void {
	for (let attempt = 0; attempt < 1000; attempt++) {
		const counts = UPGRADES.map(() => (nextInt(state, 2) === 0 ? 2 : 1));
		const pairs = counts.filter((c) => c === 2).length;
		if (pairs >= 4 && pairs <= 10) {
			UPGRADES.forEach((u, i) => {
				state.supply[u] = counts[i] ?? 1;
			});
			return;
		}
	}
	throw new Error("unreachable: two-player supply roll");
}

function buildDeck(state: GameState, resource: Resource): number[] {
	const deck: number[] = [];
	const spec = PRODUCTION_DECKS[resource];
	for (const [value, count] of Object.entries(spec.distribution)) {
		for (let i = 0; i < count; i++) {
			deck.push(Number(value));
		}
	}
	return shuffle(state, deck);
}

export function bigThreshold(state: GameState): number {
	return SETUP_CHART[Math.min(state.players.length, 10)]?.bigThreshold ?? 40;
}

export function handCapacity(player: PlayerState): number {
	let cap = BASE_HAND_CAPACITY;
	for (const u of UPGRADES) {
		cap += (UPGRADE_SPECS[u].handCapacityBonus ?? 0) * player.upgrades[u];
	}
	return cap;
}

export function populationMax(player: PlayerState): number {
	let max = BASE_POPULATION_MAX;
	for (const u of UPGRADES) {
		max += (UPGRADE_SPECS[u].populationBonus ?? 0) * player.upgrades[u];
	}
	return max;
}

/**
 * Robots don't count against the population limit; each Robots upgrade allows
 * robots up to the current population count (v1.32 expert-rules limit).
 */
export function robotMax(player: PlayerState): number {
	return player.upgrades.robots * player.population;
}

export function operators(player: PlayerState): number {
	return player.population + player.robots;
}

/** Number of hand cards that count against hand capacity. */
export function countingHandSize(player: PlayerState): number {
	return player.hand.filter((c) => !CAP_EXEMPT.includes(c.t)).length;
}

export function handValue(player: PlayerState): number {
	return player.hand.reduce((sum, c) => sum + c.v, 0);
}

/**
 * Bounds on a hand's value from PUBLIC information only: card types are always
 * visible (stripSecret hides just the values), so each hidden card is worth
 * between its deck's minimum and maximum. Known values count exactly, so for
 * the viewer's own hand this collapses to the true value.
 */
export function handValueRange(player: PlayerState): { min: number; max: number } {
	let min = 0;
	let max = 0;
	for (const card of player.hand) {
		if (card.v >= 0) {
			min += card.v;
			max += card.v;
		} else {
			min += MIN_CARD_VALUE[card.t];
			max += MAX_CARD_VALUE[card.t];
		}
	}
	return { min, max };
}

export function populationCost(player: PlayerState): number {
	return player.upgrades.ecoplants > 0 ? POPULATION_COST_ECOPLANTS : POPULATION_COST;
}

/** Per-buyer discount on an upgrade's auction price. */
export function upgradeDiscount(player: PlayerState, upgrade: Upgrade): number {
	let discount = 0;
	if (upgrade === "scientists" || upgrade === "laboratory") {
		discount += 10 * player.upgrades.dataLibrary;
	}
	if (upgrade === "warehouse" || upgrade === "nodule") {
		discount += 5 * player.upgrades.heavyEquipment;
	}
	if (upgrade === "outpost") {
		discount += 15 * player.upgrades.heavyEquipment + 10 * player.upgrades.ecoplants;
	}
	return discount;
}

export function canBuyFactory(player: PlayerState, type: FactoryType): boolean {
	const spec = FACTORIES[type];
	if (spec.requires && player.upgrades[spec.requires] === 0) {
		return false;
	}
	if (spec.needsResearchCard && !player.hand.some((c) => c.t === "research")) {
		return false;
	}
	return true;
}

export function victoryPoints(player: PlayerState): number {
	let vp = 0;
	for (const factory of player.factories) {
		if (factory.manned) {
			vp += FACTORIES[factory.type].vp;
		}
	}
	for (const u of UPGRADES) {
		vp += UPGRADE_SPECS[u].vp * player.upgrades[u];
	}
	return vp;
}

export function scores(state: GameState): number[] {
	return state.players.map((p) => victoryPoints(p));
}

/** Purchase order: VP descending, then total spent descending, then seat. */
export function computePurchaseOrder(state: GameState): number[] {
	return state.players
		.map((p, seat) => ({ seat, vp: victoryPoints(p), spent: p.spent, dropped: p.dropped }))
		.filter((e) => !e.dropped)
		.sort((a, b) => b.vp - a.vp || b.spent - a.spent || a.seat - b.seat)
		.map((e) => e.seat);
}

export function drawCard(state: GameState, resource: Resource): number | undefined {
	const deck = state.decks[resource];
	if (deck.length === 0) {
		const discard = state.discards[resource];
		if (discard.length === 0) {
			return undefined;
		}
		state.decks[resource] = shuffle(state, discard.splice(0));
	}
	return state.decks[resource].pop();
}

/** Max a player could pay for an upgrade right now: hand value plus their discount on it. */
export function maxBid(state: GameState, seat: number, upgrade: Upgrade): number {
	const player = state.players[seat];
	if (!player) {
		return 0;
	}
	return handValue(player) + upgradeDiscount(player, upgrade);
}

/**
 * Upper bound on a player's max bid using only PUBLIC information: each card is
 * worth at most the highest value in its deck. A card's TYPE is always public
 * (stripSecret hides only the value), so an opponent can compute this bound for
 * any hand they can see. Computed the same way from a stripped log (v = -1) as
 * from the live state, so replay is identical and it never leaks hand values.
 */
export function publicMaxBid(state: GameState, seat: number, upgrade: Upgrade): number {
	const player = state.players[seat];
	if (!player) {
		return 0;
	}
	let value = 0;
	for (const card of player.hand) {
		value += MAX_CARD_VALUE[card.t];
	}
	return value + upgradeDiscount(player, upgrade);
}

/** True when every card in the player's hand is hidden (v = -1), i.e. a stripped state. */
export function handIsStripped(player: PlayerState): boolean {
	return player.hand.length > 0 && player.hand.every((c) => c.v < 0);
}

/**
 * True when the player provably cannot beat the high bid, so bidding auto-passes.
 * Public-info bound is always applied (hidden card = its type's deck max, which
 * is computable from a stripped log too, so it replays identically and leaks
 * nothing). The true hand value is only used when the player opted in via the
 * autoPassBids setting, since it reveals that their hand is weak.
 */
export function mustAutoPassBid(state: GameState, seat: number): boolean {
	const auction = state.auction;
	if (!auction) {
		return false;
	}
	const player = state.players[seat];
	if (!player) {
		return false;
	}
	if (publicMaxBid(state, seat, auction.upgrade) <= auction.highBid) {
		return true;
	}
	// Optional chain: states saved before the settings field existed lack it.
	return player.settings?.autoPassBids === true && maxBid(state, seat, auction.upgrade) <= auction.highBid;
}

/** Coarse list of the moves available to a player, for the BGS sidebar. */
export function availableMoves(state: GameState, player?: number): string[] {
	if (state.ended || player === undefined) {
		return [];
	}
	const p = state.players[player];
	if (!p || p.dropped) {
		return [];
	}
	switch (state.phase) {
		case "discard":
			return p.mustDiscard ? ["discard"] : [];
		case "auction":
			return state.auction?.activeBidder === player && !mustAutoPassBid(state, player) ? ["bid", "bidPass"] : [];
		case "auctionPayment":
			return state.auction?.highBidder === player ? ["pay"] : [];
		case "actions": {
			if (state.activeSeat !== player || p.done) {
				return [];
			}
			const moves = ["endTurn"];
			if (state.market.length > 0) {
				moves.push("auction");
			}
			return moves;
		}
		default:
			return [];
	}
}
