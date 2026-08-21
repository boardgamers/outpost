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
	dropped: boolean;
	/** Per-player gameplay settings (set via setPlayerSettings). */
	settings: PlayerSettings;
}

export interface PlayerSettings {
	/** Auto-pass an auction when the player's true hand value can't beat the high bid. */
	autoPassBids?: boolean;
}

export type Phase = "discard" | "actions" | "auction" | "auctionPayment" | "ended";

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
}

export type Move =
	| { action: "discard"; cards: number[] }
	| { action: "auction"; marketIndex: number; bid: number }
	| { action: "bid"; amount: number }
	| { action: "bidPass" }
	| { action: "pay"; cards: number[] }
	| { action: "buyFactory"; factory: FactoryType; cards: number[] }
	| { action: "buyPopulation"; count: number; cards: number[] }
	| { action: "buyRobots"; count: number; cards: number[] }
	| { action: "endTurn"; manned: number[] };

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
	seed: string;
	/** Number of PRNG draws consumed so far (determinism across save/load). */
	rngCounter: number;
	options: Record<string, unknown>;
	log: LogEntry[];
	moveCount: number;
	ended: boolean;
	messages: string[];
}
