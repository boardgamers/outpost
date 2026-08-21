import type { FactoryType, Resource, Upgrade } from "./types.js";

// Rules data for the 20th Anniversary edition (former "Expert Rules v1.32").
// Sources: the official Outpost reference sheet v1.32 (costs, average values,
// VPs, setup chart) and owner card counts reported on BGG (thread 2801038) for
// the production deck distributions. Water, titanium, new chemicals and
// orbital medicine distributions are confirmed card-by-card; the other decks
// use symmetric bell distributions matching the confirmed deck sizes and the
// official average values.

export interface DeckSpec {
	average: number;
	/** value -> number of copies */
	distribution: Record<number, number>;
}

export const PRODUCTION_DECKS: Record<Resource, DeckSpec> = {
	ore: { average: 3, distribution: { 1: 3, 2: 6, 3: 8, 4: 6, 5: 3 } },
	water: { average: 7, distribution: { 4: 3, 5: 5, 6: 7, 7: 9, 8: 7, 9: 5, 10: 3 } },
	titanium: { average: 10, distribution: { 7: 5, 8: 7, 9: 9, 10: 11, 11: 9, 12: 7, 13: 5 } },
	research: { average: 13, distribution: { 9: 2, 10: 3, 11: 4, 12: 5, 13: 6, 14: 5, 15: 4, 16: 3, 17: 2 } },
	microbiotics: { average: 17, distribution: { 14: 1, 15: 2, 16: 3, 17: 4, 18: 3, 19: 2, 20: 1 } },
	newChemicals: { average: 20, distribution: { 14: 2, 16: 3, 18: 4, 20: 5, 22: 4, 24: 3, 26: 2 } },
	orbitalMedicine: { average: 30, distribution: { 20: 2, 25: 3, 30: 4, 35: 3, 40: 2 } },
	ringOre: { average: 40, distribution: { 30: 2, 35: 2, 40: 4, 45: 2, 50: 2 } },
	moonOre: { average: 50, distribution: { 40: 2, 45: 2, 50: 4, 55: 2, 60: 2 } },
};

/** Highest card value in each production deck (public rules data). */
export const MAX_CARD_VALUE: Record<Resource, number> = Object.fromEntries(
	Object.entries(PRODUCTION_DECKS).map(([resource, spec]) => [
		resource,
		Math.max(...Object.keys(spec.distribution).map(Number)),
	])
) as Record<Resource, number>;

/** Resources that do not count against hand capacity. */
export const CAP_EXEMPT: readonly Resource[] = ["research", "microbiotics"];

export interface FactorySpec {
	cost: number;
	vp: number;
	/** Upgrade required to be allowed to buy this factory type. */
	requires?: Upgrade;
	/** Buying requires spending at least one research production card. */
	needsResearchCard?: boolean;
}

export const FACTORIES: Record<FactoryType, FactorySpec> = {
	ore: { cost: 10, vp: 1 },
	water: { cost: 20, vp: 1 },
	titanium: { cost: 30, vp: 2, requires: "heavyEquipment" },
	research: { cost: 30, vp: 2, requires: "laboratory" },
	newChemicals: { cost: 60, vp: 3, needsResearchCard: true },
};

export interface UpgradeSpec {
	name: string;
	/** Minimum bid. */
	price: number;
	vp: number;
	/** Free production card(s) received each round per copy owned. */
	produces?: Resource;
	/** Free factory received on purchase (starts unmanned). */
	freeFactory?: FactoryType;
	handCapacityBonus?: number;
	populationBonus?: number;
}

export const UPGRADE_SPECS: Record<Upgrade, UpgradeSpec> = {
	dataLibrary: { name: "Data Library", price: 15, vp: 1 },
	warehouse: { name: "Warehouse", price: 25, vp: 1, handCapacityBonus: 3 },
	heavyEquipment: { name: "Heavy Equipment", price: 25, vp: 1 },
	nodule: { name: "Nodule", price: 25, vp: 2, populationBonus: 3 },
	scientists: { name: "Scientists", price: 40, vp: 2, produces: "research" },
	orbitalLab: { name: "Orbital Lab", price: 50, vp: 3, produces: "microbiotics" },
	robots: { name: "Robots", price: 50, vp: 3 },
	laboratory: { name: "Laboratory", price: 100, vp: 5, freeFactory: "research" },
	ecoplants: { name: "Ecoplants", price: 50, vp: 5 },
	outpost: { name: "Outpost", price: 100, vp: 5, freeFactory: "titanium", handCapacityBonus: 5, populationBonus: 5 },
	spaceStation: { name: "Space Station", price: 120, vp: 10, produces: "orbitalMedicine" },
	planetaryCruiser: { name: "Planetary Cruiser", price: 160, vp: 15, produces: "ringOre" },
	moonBase: { name: "Moon Base", price: 200, vp: 20, produces: "moonOre" },
};

/** Upgrade types rolled with the d4 / d10 / d12+1 (index = die result - 1). */
export const UPGRADE_BY_ROLL: readonly Upgrade[] = [
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
];

export const FIRST_TEN: readonly Upgrade[] = UPGRADE_BY_ROLL.slice(0, 10);
export const LAST_THREE: readonly Upgrade[] = UPGRADE_BY_ROLL.slice(10);

export interface SetupRow {
	firstTen: number;
	lastThree: number;
	/** VP any player must reach before the d12+1 (phase 3) rolls start. */
	bigThreshold: number;
}

/** Expert game setup chart (reference sheet v1.32). Player count 2 uses a die roll per type instead. */
export const SETUP_CHART: Record<number, SetupRow> = {
	2: { firstTen: 0, lastThree: 0, bigThreshold: 40 },
	3: { firstTen: 2, lastThree: 2, bigThreshold: 35 },
	4: { firstTen: 3, lastThree: 3, bigThreshold: 40 },
	5: { firstTen: 3, lastThree: 4, bigThreshold: 30 },
	6: { firstTen: 4, lastThree: 4, bigThreshold: 35 },
	7: { firstTen: 5, lastThree: 5, bigThreshold: 40 },
	8: { firstTen: 5, lastThree: 6, bigThreshold: 30 },
	9: { firstTen: 6, lastThree: 6, bigThreshold: 35 },
	10: { firstTen: 7, lastThree: 7, bigThreshold: 40 },
};

export const VICTORY_VP = 75;
export const BASE_HAND_CAPACITY = 10;
export const BASE_POPULATION_MAX = 5;
export const POPULATION_COST = 10;
export const POPULATION_COST_ECOPLANTS = 5;
export const ROBOT_COST = 10;
/** VP any player must reach before the d10 (phase 2) rolls start. */
export const MID_THRESHOLD = 10;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 9;
