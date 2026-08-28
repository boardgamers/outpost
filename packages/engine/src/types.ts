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
	/** Total credits spent over the game (purchase-order tie-break). */
	spent: number;
	/** Turn bookkeeping: has finished their action turn this round. */
	done: boolean;
	/** Must still discard down to hand capacity this round. */
	mustDiscard: boolean;
	/** Draws just produced, awaiting the mega-vs-singles choice (mega phase). */
	pendingMega?: ProductionCard[];
	dropped: boolean;
	/** Per-player gameplay settings (set via setPlayerSettings). */
	settings: PlayerSettings;
}

export interface PlayerSettings {
	/** Auto-pass an auction when the player's true hand value can't beat the high bid. */
	autoPassBids?: boolean;
}

export type Phase = "mega" | "discard" | "actions" | "auction" | "auctionPayment" | "ended";

export interface AuctionState {
	/** Index into state.market of the upgrade under auction. */
	marketIndex: number;
	upgrade: Upgrade;
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
	| { action: "mega"; cards: number[] }
	| { action: "discard"; cards: number[] }
	| { action: "auction"; marketIndex: number; bid: number }
	| { action: "bid"; amount: number }
	| { action: "bidPass" }
	| { action: "pay"; cards: number[] }
	| { action: "endTurn"; buys: TurnBuy[]; manned: number[] };

export type LogEntry =
	| { type: "init"; players: number; seed: string; options: Record<string, unknown> }
	| {
			type: "round";
			round: number;
			purchaseOrder: number[];
			market: Upgrade[];
			supply: Record<Upgrade, number>;
			produced: { player: number; cards: ProductionCard[] }[];
	  }
	| { type: "move"; player: number; move: Move; info?: MoveInfo }
	| { type: "end"; scores: number[] };

/** Derived facts recorded with a move so the log can be described without replaying. */
export interface MoveInfo {
	paid?: number;
	upgrade?: Upgrade;
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
	/** Upgrades currently up for auction. */
	market: Upgrade[];
	/** Remaining copies of each upgrade in the supply. */
	supply: Record<Upgrade, number>;
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
