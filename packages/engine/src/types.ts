export const RESOURCES = [
	"ore",
	"water",
	"titanium",
	"research",
	"microbiotics",
	"newChemicals",
	"orbitalMedicine",
	"ringOre",
	"moonOre",
] as const;

export type Resource = (typeof RESOURCES)[number];

export const FACTORY_TYPES = ["ore", "water", "titanium", "research", "newChemicals"] as const;

export type FactoryType = (typeof FACTORY_TYPES)[number];

export const UPGRADES = [
	"dataLibrary",
	"warehouse",
	"heavyEquipment",
	"nodule",
	"scientists",
	"orbitalLab",
	"robots",
	"laboratory",
	"ecoplants",
	"outpost",
	"spaceStation",
	"planetaryCruiser",
	"moonBase",
] as const;

export type Upgrade = (typeof UPGRADES)[number];

export const KICKERS = [
	"iceProspector",
	"robotPrototype",
	"smelter",
	"wilyTrader",
	"launchFacility",
	"merchantHouse",
	"ncfPrototype",
	"refinery",
	"biosphere",
] as const;

export type Kicker = (typeof KICKERS)[number];

/** Any card that can sit in the market: a colony upgrade or a Kicker card. */
export type MarketCard = Upgrade | Kicker;

export interface ProductionCard {
	/** Resource type. */
	t: Resource;
	/** Credit value. -1 when hidden by stripSecret. */
	v: number;
	/** Mega production card (rule 12.1): fixed value, counts as 4 cards toward hand capacity. */
	m?: true;
}

export interface Factory {
	type: FactoryType;
	manned: boolean;
}

export interface PlayerState {
	name: string;
	factories: Factory[];
	population: number;
	robots: number;
	hand: ProductionCard[];
	upgrades: Record<Upgrade, number>;
	/** Kicker expansion: copies of each Kicker card owned. */
	kickers: Record<Kicker, number>;
	/** Total credits spent over the game (purchase-order tie-break). */
	spent: number;
	/** Turn bookkeeping: has finished their action turn this round. */
	done: boolean;
	/** Must still discard down to hand capacity this round. */
	mustDiscard: boolean;
	/** Draws just produced, awaiting the mega-vs-singles choice (mega phase). */
	pendingMega?: ProductionCard[];
	/**
	 * Mega-eligible groups this round (rule 12.1): full groups of 4 operated
	 * factories per mega resource, computed at production time. The election is
	 * blind — made before the pendingMega values are revealed to the player.
	 */
	megaGroups?: Partial<Record<Resource, number>>;
	dropped: boolean;
	/** Per-player gameplay settings (set via setPlayerSettings). */
	settings: PlayerSettings;
}

export interface PlayerSettings {
	/** Auto-pass an auction when the player's true hand value can't beat the high bid. */
	autoPassBids?: boolean;
}

export type Phase = "mega" | "discard" | "exchange" | "actions" | "auction" | "auctionPayment" | "ended";

/**
 * Kicker expansion: state of the Wily Trader / Merchant House exchange step
 * (end of the discard phase). Owners act in player order; `seat` is whose
 * exchange action is pending. `parked` holds the cards taken this phase that
 * sit face-down on a Wily Trader / Merchant House card until the phase ends —
 * they cannot be taken again by another exchange this phase.
 */
export interface ExchangeState {
	/** Seat currently asked to exchange (or pass). */
	seat: number;
	/** Seats that have already taken their exchange action this phase. */
	acted: number[];
	/**
	 * Cards taken by exchanges this phase, parked face-down on the Wily Trader
	 * / Merchant House that took them until the phase ends (so they cannot be
	 * taken again by another exchange this phase). Each returns to its owner's
	 * hand when the phase ends.
	 */
	parked: { seat: number; card: ProductionCard }[];
}

export interface AuctionState {
	/** Index into state.market (or state.kickerMarket when kicker is set). */
	marketIndex: number;
	/** The colony upgrade under auction (absent when a Kicker card is auctioned). */
	upgrade?: Upgrade;
	/** Kicker expansion: the Kicker card under auction (index into kickerMarket). */
	kicker?: Kicker;
	/** Seat of the player who opened the auction (their action turn resumes afterwards). */
	auctioneer: number;
	highBid: number;
	highBidder: number;
	/** Seats that passed out of this auction. */
	passed: number[];
	/** Seat currently asked to bid (only meaningful in phase "auction"). */
	activeBidder: number;
	/**
	 * fastBid option: sealed bids by seat (0 = pass), present only in fast
	 * auctions. Everyone bids at once; the auction resolves when every active
	 * seat has bid. Other players' bids are hidden (-1) by stripSecret.
	 */
	bids?: Record<string, number>;
}

/**
 * A purchase step inside an endTurn move. Card indices are relative to the hand
 * as it stands when the step applies (earlier steps have removed their cards).
 */
export type TurnBuy =
	| { buy: "factory"; factory: FactoryType; cards: number[] }
	| { buy: "population"; count: number; cards: number[] }
	| { buy: "robots"; count: number; cards: number[] };

// A player's whole action turn (purchases + manning) is one endTurn move: the
// platform grants time per persisted move, so splitting a turn into many moves
// would farm extra time. Auctions stay separate moves (they interleave seats).
export type Move =
	// Mega election (rule 12.1): how many Mega cards to take per resource, blind
	// (before the pending draw values are revealed). The rest are kept as draws.
	| { action: "mega"; take: Partial<Record<Resource, number>> }
	| { action: "discard"; cards: number[] }
	| { action: "auction"; marketIndex: number; bid: number; kicker?: boolean }
	| { action: "bid"; amount: number }
	| { action: "bidPass" }
	| { action: "pay"; cards: number[] }
	// Wily Trader / Merchant House: hand one of your own cards (index into the
	// hand) to `target`, who must return a higher-valued card of the same type.
	| { action: "exchange"; card: number; target: number }
	| { action: "exchangePass" }
	| { action: "endTurn"; buys: TurnBuy[]; manned: number[] };

export type LogEntry =
	| { type: "init"; players: number; seed: string; options: Record<string, unknown> }
	| {
			type: "round";
			round: number;
			purchaseOrder: number[];
			market: Upgrade[];
			supply: Record<Upgrade, number>;
			/** Kicker expansion: the Kicker slots after this round's refill. */
			kickerMarket?: Kicker[];
			/** Kicker expansion: era and remaining piles after this round's refill (for exact replay). */
			kickerEra?: 1 | 2 | 3;
			kickerPiles?: Record<1 | 2 | 3, Kicker[]>;
			/** Era-fallback streaks as this round began (for exact replay). */
			eraStreak4?: number;
			eraStreak10?: number;
			/** The game era in effect this round (evaluated at the colony ship's arrival). */
			era?: 1 | 2 | 3;
			produced: { player: number; cards: ProductionCard[] }[];
			/** Mega-eligible groups per player this round (rule 12.1), for exact replay. */
			megaGroups?: { player: number; groups: Partial<Record<Resource, number>> }[];
	  }
	| { type: "move"; player: number; move: Move; info?: MoveInfo }
	| { type: "end"; scores: number[] };

/** Derived facts recorded with a move so the log can be described without replaying. */
export interface MoveInfo {
	paid?: number;
	upgrade?: Upgrade;
	/** Kicker card bought this move (for the log description). */
	kicker?: Kicker;
	discarded?: number;
	/** Mega cards taken with this "mega" move (for the log description). */
	mega?: number;
	/**
	 * Seats auto-passed out of the auction by this move (public bound or the
	 * autoPassBids setting). Replay applies these verbatim: the true-value check
	 * cannot be recomputed from a stripped log.
	 */
	autoPassed?: number[];
	/**
	 * fastBid: recorded on the move that resolves the auction — the winning bid,
	 * the runner-up bid (0 for a sole bidder) and the winning seat. Replay
	 * derives the price and winner from these: the other sealed bids are hidden
	 * in a stripped log, so the resolution cannot be recomputed from them.
	 */
	winningBid?: number;
	secondBid?: number;
	winner?: number;
	/**
	 * Wily Trader / Merchant House exchange resolution, recorded so a stripped
	 * log replays verbatim (the target's card values are hidden, so which card
	 * they hand back cannot be recomputed). `exchangeTake` is the index into
	 * the target's hand of the card they returned, or -1 when they had nothing
	 * higher and returned the given card. `exchangeValue` is the returned
	 * card's value (for the log description; -1 keeps it hidden).
	 */
	exchangeTake?: number;
	exchangeValue?: number;
}

export interface GameState {
	players: PlayerState[];
	round: number;
	phase: Phase;
	/** Seat numbers in purchase order for the current round. */
	purchaseOrder: number[];
	/** Seat whose action turn it is (phase "actions"). */
	activeSeat: number;
	auction: AuctionState | null;
	/** Kicker expansion: Wily Trader / Merchant House exchange step (phase "exchange"). */
	exchange: ExchangeState | null;
	/** Upgrades currently up for auction. */
	market: Upgrade[];
	/** Remaining copies of each upgrade in the supply. */
	supply: Record<Upgrade, number>;
	/**
	 * Consecutive round-begins with every upgrade 1-4 (eraStreak4) or 1-10
	 * (eraStreak10) already purchased — the "very rare" era-advance fallback:
	 * at 2 the era steps up even with no player at the VP threshold. Optional:
	 * states saved before the fields existed lack them (treated as 0).
	 */
	eraStreak4?: number;
	eraStreak10?: number;
	/**
	 * The game era in effect (1-3). Era transitions happen during Phase 2, when
	 * the colony ship arrives: a mid-round VP change does not advance the era
	 * until the next round begins. Optional for pre-0.9.7 saved states.
	 */
	era?: 1 | 2 | 3;
	/** Kicker expansion: Kicker cards currently in the Kicker slots. */
	kickerMarket: Kicker[];
	/** Kicker expansion: remaining Kicker piles by era (shuffled, face-down). */
	kickerPiles: Record<1 | 2 | 3, Kicker[]>;
	/** Kicker expansion: current era (1-3); kicker slots refilled from this era. */
	kickerEra: 1 | 2 | 3;
	/** Draw piles, face-down (top = last element). */
	decks: Record<Resource, number[]>;
	/** Spent cards, face-up. */
	discards: Record<Resource, number[]>;
	/** Remaining mega production cards per resource (separate face-up pool). */
	megaSupply: Partial<Record<Resource, number>>;
	seed: string;
	/** Number of PRNG draws consumed so far (determinism across save/load). */
	rngCounter: number;
	options: Record<string, unknown>;
	log: LogEntry[];
	moveCount: number;
	ended: boolean;
	messages: string[];
}
