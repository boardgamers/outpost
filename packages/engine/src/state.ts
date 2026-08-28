import {
	BASE_HAND_CAPACITY,
	BASE_POPULATION_MAX,
	CAP_EXEMPT,
	FACTORIES,
	FIRST_TEN,
	KICKERS_BY_ERA,
	KICKER_SPECS,
	LAST_THREE,
	MAX_CARD_VALUE,
	MAX_PLAYERS,
	MEGA_CARDS,
	MEGA_RESOURCES,
	MIN_CARD_VALUE,
	MIN_PLAYERS,
	POPULATION_COST,
	POPULATION_COST_ECOPLANTS,
	PRODUCTION_DECKS,
	SETUP_CHART,
	UPGRADE_SPECS,
	kickerSetup,
} from "./data.js";
import { nextInt, shuffle } from "./prng.js";
import { KICKERS, RESOURCES, UPGRADES } from "./types.js";
import type { FactoryType, GameState, Kicker, PlayerState, Resource, Upgrade } from "./types.js";

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
		exchange: null,
		market: [],
		supply: createSupply(players),
		decks: emptyPiles(),
		discards: emptyPiles(),
		megaSupply: Object.fromEntries(Object.entries(MEGA_CARDS).map(([r, m]) => [r, m.copies])),
		kickerMarket: [],
		kickerPiles: { 1: [], 2: [], 3: [] },
		kickerEra: 1,
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

	if (options.kicker === true) {
		setupKickers(state);
	}

	return state;
}

/** Kicker expansion: build the shuffled era piles and fill the Kicker slots for era I. */
function setupKickers(state: GameState): void {
	const { copies } = kickerSetup(state.players.length);
	for (const era of [1, 2, 3] as const) {
		const pile: Kicker[] = [];
		for (const k of KICKERS_BY_ERA[era]) {
			for (let i = 0; i < copies; i++) {
				pile.push(k);
			}
		}
		state.kickerPiles[era] = shuffle(state, pile);
	}
	state.kickerEra = 1;
}

function createPlayer(index: number): PlayerState {
	const upgrades = {} as Record<Upgrade, number>;
	for (const u of UPGRADES) {
		upgrades[u] = 0;
	}
	const kickers = {} as Record<Kicker, number>;
	for (const k of KICKERS) {
		kickers[k] = 0;
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
		kickers,
		spent: 0,
		done: false,
		mustDiscard: false,
		pendingMega: [],
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
	// Kicker: Biosphere adds to the colony support (population) limit.
	max += (KICKER_SPECS.biosphere.populationBonus ?? 0) * player.kickers.biosphere;
	return max;
}

/**
 * Robots don't count against the population limit; each Robots upgrade allows
 * robots up to the current population count (v1.32 expert-rules limit). The
 * Robot Prototype's free robot can be operated even with no Robots upgrade,
 * but counts against the limit once any Robots upgrade is owned.
 */
export function robotMax(player: PlayerState): number {
	const fromUpgrades = player.upgrades.robots * player.population;
	const prototype = player.kickers.robotPrototype > 0 ? player.kickers.robotPrototype : 0;
	return fromUpgrades === 0 ? prototype : fromUpgrades;
}

export function operators(player: PlayerState): number {
	return player.population + player.robots;
}

/** Number of hand cards that count against hand capacity (a mega card counts as 4). */
export function countingHandSize(player: PlayerState): number {
	let size = 0;
	for (const card of player.hand) {
		if (!CAP_EXEMPT.includes(card.t)) {
			size += card.m ? 4 : 1;
		}
	}
	return size;
}

export function handValue(player: PlayerState): number {
	return player.hand.reduce((sum, c) => sum + c.v, 0) + (player.pendingMega ?? []).reduce((sum, c) => sum + c.v, 0);
}

/**
 * Mega production eligibility (rule 12.1): the Mega cards a player may elect to
 * take this round — full groups of 4 operated factories per mega resource whose
 * pool isn't empty. Only factory draws count (never upgrade freebies or Kicker
 * bonuses), and the election is blind: made before the draw values are seen.
 */
export function megaEligible(state: GameState, player: PlayerState): Partial<Record<Resource, number>> {
	const result: Partial<Record<Resource, number>> = {};
	for (const [resource, groups] of Object.entries(player.megaGroups ?? {})) {
		if ((groups ?? 0) > 0 && (state.megaSupply[resource as Resource] ?? 0) > 0) {
			result[resource as Resource] = groups;
		}
	}
	return result;
}

/**
 * Mega-eligible groups from a player's operated factories (rule 12.1): full
 * groups of 4 manned factories per mega resource. Computed at production time
 * and on replay (which re-derives it from the factories manned this round).
 */
export function megaGroupsFor(player: PlayerState): Partial<Record<Resource, number>> {
	const factoryDraws: Partial<Record<Resource, number>> = {};
	for (const factory of player.factories) {
		if (factory.manned) {
			factoryDraws[factory.type] = (factoryDraws[factory.type] ?? 0) + 1;
		}
	}
	const result: Partial<Record<Resource, number>> = {};
	for (const resource of MEGA_RESOURCES) {
		const groups = Math.floor((factoryDraws[resource] ?? 0) / 4);
		if (groups > 0) {
			result[resource] = groups;
		}
	}
	return result;
}

/**
 * Pick hand-card indices paying at least `due`, minimizing the total paid
 * (overpaid credits are lost) and, among equal totals, spending as MANY cards
 * as possible (several small cards are worth less kept than one big card).
 * Exact 0/1 subset-sum DP — hands are tiny, so this is a few thousand ops.
 * Returns null when the hand cannot cover `due`.
 */
export function bestPayment(player: PlayerState, due: number, mustIncludeResearch = false): number[] | null {
	const cards = player.hand.map((card, index) => ({ v: card.v, index })).filter((c) => c.v >= 0);
	if (!mustIncludeResearch) {
		const solved = solvePayment(cards, due);
		return solved ? solved.picked.sort((a, b) => a - b) : null;
	}
	// Try each research card as the forced one and keep the best overall pick.
	let best: { total: number; picked: number[] } | null = null;
	for (const forced of cards) {
		if (player.hand[forced.index]?.t !== "research") {
			continue;
		}
		const rest = cards.filter((c) => c.index !== forced.index);
		const sub = solvePayment(rest, Math.max(0, due - forced.v));
		if (!sub) {
			continue;
		}
		const total = forced.v + sub.total;
		const count = 1 + sub.picked.length;
		if (!best || total < best.total || (total === best.total && count > best.picked.length)) {
			best = { total, picked: [forced.index, ...sub.picked] };
		}
	}
	return best ? best.picked.sort((a, b) => a - b) : null;
}

/** 0/1 knapsack over exact sums: dp[i][s] = max cards among the first i reaching exactly s. */
function solvePayment(cards: { v: number; index: number }[], due: number): { total: number; picked: number[] } | null {
	if (due <= 0) {
		return { total: 0, picked: [] };
	}
	const totalAll = cards.reduce((sum, c) => sum + c.v, 0);
	if (totalAll < due) {
		return null;
	}
	const n = cards.length;
	const width = totalAll + 1;
	// Flat (n+1) x width table of best counts; -1 = sum unreachable.
	const dp = new Int32Array((n + 1) * width).fill(-1);
	dp[0] = 0;
	for (let i = 0; i < n; i++) {
		const v = (cards[i] as { v: number }).v;
		const prev = i * width;
		const cur = prev + width;
		for (let s = 0; s < width; s++) {
			let count = dp[prev + s] as number;
			if (s >= v && dp[prev + s - v] !== -1 && (dp[prev + s - v] as number) + 1 > count) {
				count = (dp[prev + s - v] as number) + 1;
			}
			dp[cur + s] = count;
		}
	}
	let sum = -1;
	for (let s = due; s < width; s++) {
		if (dp[n * width + s] !== -1) {
			sum = s;
			break;
		}
	}
	if (sum === -1) {
		return null;
	}
	const total = sum;
	const picked: number[] = [];
	for (let i = n; i > 0; i--) {
		const card = cards[i - 1] as { v: number; index: number };
		const withoutIt = dp[(i - 1) * width + sum] as number;
		if (dp[i * width + sum] !== withoutIt) {
			picked.push(card.index);
			sum -= card.v;
		}
	}
	return { total, picked };
}

/**
 * Bounds on a hand's value from PUBLIC information only: card types are always
 * visible (stripSecret hides just the values), so each hidden card is worth
 * between its deck's minimum and maximum. Known values count exactly, so for
 * the viewer's own hand this collapses to the true value.
 */
export function handValueRange(player: PlayerState, asSeenByOthers = false): { min: number; max: number } {
	let min = 0;
	let max = 0;
	for (const card of [...player.hand, ...(player.pendingMega ?? [])]) {
		// A mega card's value is printed on it, so it stays public even when
		// the rest of the hand is hidden. asSeenByOthers treats every non-mega
		// card as hidden (the owner's own values are known to them, but their
		// opponents only see the card types).
		if (card.m || (card.v >= 0 && !asSeenByOthers)) {
			min += card.v;
			max += card.v;
		} else {
			min += MIN_CARD_VALUE[card.t];
			max += MAX_CARD_VALUE[card.t];
		}
	}
	return { min, max };
}

/** Expected hand value from public information: known cards exact, hidden cards at their deck average. */
export function handValueExpected(player: PlayerState, asSeenByOthers = false): number {
	let total = 0;
	for (const card of [...player.hand, ...(player.pendingMega ?? [])]) {
		total += card.m || (card.v >= 0 && !asSeenByOthers) ? card.v : PRODUCTION_DECKS[card.t].average;
	}
	return total;
}

/**
 * Per-round production of a player: one card per manned factory plus the free
 * cards from producing upgrades. Returns the min/max/expected total value —
 * all public information (manned factories and upgrades are visible).
 */
export function productionRange(player: PlayerState): { min: number; max: number; avg: number } {
	let min = 0;
	let max = 0;
	let avg = 0;
	const add = (resource: Resource) => {
		min += MIN_CARD_VALUE[resource];
		max += MAX_CARD_VALUE[resource];
		avg += PRODUCTION_DECKS[resource].average;
	};
	for (const factory of player.factories) {
		if (factory.manned) {
			add(factory.type);
		}
	}
	for (const u of UPGRADES) {
		const resource = UPGRADE_SPECS[u].produces;
		if (resource) {
			for (let i = 0; i < player.upgrades[u]; i++) {
				add(resource);
			}
		}
	}
	// Mega production (4 manned factories of a mega resource): the best case is
	// the fixed mega value per group of 4, singles at deck max for the rest.
	for (const [resource, mega] of Object.entries(MEGA_CARDS)) {
		const r = resource as Resource;
		const draws = player.factories.filter((f) => f.type === r && f.manned).length;
		if (draws >= 4) {
			const megaMax = Math.floor(draws / 4) * mega.value + (draws % 4) * MAX_CARD_VALUE[r];
			const singleMax = draws * MAX_CARD_VALUE[r];
			max += Math.max(megaMax, singleMax) - singleMax;
		}
	}
	return { min, max, avg };
}

export function populationCost(player: PlayerState): number {
	return player.upgrades.ecoplants > 0 ? POPULATION_COST_ECOPLANTS : POPULATION_COST;
}

/** The card under auction: its display name, list price, and the buyer's discount (0 for Kicker cards). */
export function auctionCard(auction: { upgrade?: Upgrade; kicker?: Kicker }): {
	name: string;
	price: number;
	upgrade?: Upgrade;
	kicker?: Kicker;
} {
	if (auction.kicker) {
		const spec = KICKER_SPECS[auction.kicker];
		return { name: spec.name, price: spec.price, kicker: auction.kicker };
	}
	const spec = UPGRADE_SPECS[auction.upgrade as Upgrade];
	return { name: spec.name, price: spec.price, upgrade: auction.upgrade };
}

/** Discount a buyer gets on the card under auction (Kicker cards have none). */
export function auctionDiscount(player: PlayerState, auction: { upgrade?: Upgrade; kicker?: Kicker }): number {
	return auction.upgrade ? upgradeDiscount(player, auction.upgrade) : 0;
}

/** Resource types a Wily Trader owner may offer in an exchange. */
export const WILY_TRADER_RESOURCES: readonly Resource[] = ["ore", "water", "titanium"];
/** Resource types a Merchant House owner may offer in an exchange. */
export const MERCHANT_HOUSE_RESOURCES: readonly Resource[] = ["research", "microbiotics", "newChemicals"];

/**
 * The resource types a player may offer in a Wily Trader / Merchant House
 * exchange, from the Kicker cards they own (owning both covers all six).
 */
export function exchangeResources(player: PlayerState): Resource[] {
	const resources: Resource[] = [];
	if (player.kickers.wilyTrader > 0) {
		resources.push(...WILY_TRADER_RESOURCES);
	}
	if (player.kickers.merchantHouse > 0) {
		resources.push(...MERCHANT_HOUSE_RESOURCES);
	}
	return resources;
}

/**
 * Whether the seat has any legal exchange this phase: owns a Wily Trader /
 * Merchant House, holds a non-Mega card of a tradable type, and some other
 * active player holds a non-Mega card of the same type. Card values are
 * irrelevant here (they only decide what the target hands back).
 */
export function hasExchange(state: GameState, seat: number): boolean {
	const player = state.players[seat];
	if (!player || player.dropped) {
		return false;
	}
	const tradable = exchangeResources(player);
	if (tradable.length === 0) {
		return false;
	}
	const offered = new Set(player.hand.filter((c) => !c.m && tradable.includes(c.t)).map((c) => c.t));
	if (offered.size === 0) {
		return false;
	}
	return state.players.some(
		(other, otherSeat) => otherSeat !== seat && !other.dropped && other.hand.some((c) => !c.m && offered.has(c.t))
	);
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
	// Kicker: Smelter discounts Robots upgrades; Launch Facility discounts the
	// three big production upgrades.
	if (upgrade === "robots") {
		discount += 5 * player.kickers.smelter;
	}
	if (upgrade === "spaceStation" || upgrade === "planetaryCruiser" || upgrade === "moonBase") {
		discount += 30 * player.kickers.launchFacility;
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
	for (const k of KICKERS) {
		vp += KICKER_SPECS[k].vp * player.kickers[k];
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

/** Max a player could pay for a card right now: hand value plus their discount on it (none for Kicker cards). */
export function maxBid(state: GameState, seat: number, upgrade?: Upgrade): number {
	const player = state.players[seat];
	if (!player) {
		return 0;
	}
	return handValue(player) + (upgrade ? upgradeDiscount(player, upgrade) : 0);
}

/**
 * Upper bound on a player's max bid using only PUBLIC information: each card is
 * worth at most the highest value in its deck. A card's TYPE is always public
 * (stripSecret hides only the value), so an opponent can compute this bound for
 * any hand they can see. Computed the same way from a stripped log (v = -1) as
 * from the live state, so replay is identical and it never leaks hand values.
 */
export function publicMaxBid(state: GameState, seat: number, upgrade?: Upgrade): number {
	const player = state.players[seat];
	if (!player) {
		return 0;
	}
	let value = 0;
	for (const card of player.hand) {
		// A mega card is face-up with a fixed printed value that can exceed the
		// deck max (Mega Titanium 44 vs deck max 13) — use it, not the deck max.
		value += card.m ? card.v : MAX_CARD_VALUE[card.t];
	}
	return value + (upgrade ? upgradeDiscount(player, upgrade) : 0);
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
		case "mega":
			return (p.pendingMega?.length ?? 0) > 0 ? ["mega"] : [];
		case "discard":
			return p.mustDiscard ? ["discard"] : [];
		case "exchange":
			return state.exchange?.seat === player ? ["exchange", "exchangePass"] : [];
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
