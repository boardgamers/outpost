import { KICKER_SPECS, MID_THRESHOLD, UPGRADE_BY_ROLL, kickerSetup } from "./data.js";
import { rollDie } from "./prng.js";
import { bigThreshold, scores } from "./state.js";
import type { GameState, Kicker, Upgrade } from "./types.js";

/**
 * Current game era (1-3) — drives both the market die and the Kicker era. The
 * era advances when the leader reaches the VP threshold, or via the "very
 * rare" fallback: a second consecutive round beginning with every upgrade 1-4
 * (→ Era II) or 1-10 (→ Era III) already purchased (tracked in eraStreak4/10).
 */
export function colonyEra(state: GameState): 1 | 2 | 3 {
	const best = Math.max(0, ...scores(state));
	if (best >= bigThreshold(state) || (state.eraStreak10 ?? 0) >= 2) {
		return 3;
	}
	if (best >= MID_THRESHOLD || (state.eraStreak4 ?? 0) >= 2) {
		return 2;
	}
	return 1;
}

/** Which die is rolled to refill the market, based on the current era. */
export function marketDie(state: GameState): { sides: number; offset: number } {
	const era = colonyEra(state);
	if (era === 3) {
		return { sides: 12, offset: 1 }; // d12+1: upgrades 2-13
	}
	if (era === 2) {
		return { sides: 10, offset: 0 }; // d10: upgrades 1-10
	}
	return { sides: 4, offset: 0 }; // d4: upgrades 1-4
}

/** Max copies of one upgrade type in the market: half the players, rounded down, min 1. */
export function marketTypeCap(state: GameState): number {
	return Math.max(1, Math.floor(state.players.length / 2));
}

/**
 * Update the era-advance fallback streaks at the start of a round, before the
 * market refills: count consecutive round-begins with every upgrade 1-4 / 1-10
 * already purchased (supply exhausted). Called once per round by beginRound.
 */
export function updateEraStreaks(state: GameState): void {
	const supplyEmpty = (count: number) => UPGRADE_BY_ROLL.slice(0, count).every((u) => state.supply[u] <= 0);
	// `?? 0`: states saved before the streak fields existed lack them.
	state.eraStreak4 = supplyEmpty(4) ? (state.eraStreak4 ?? 0) + 1 : 0;
	state.eraStreak10 = supplyEmpty(10) ? (state.eraStreak10 ?? 0) + 1 : 0;
}

function marketCount(state: GameState, upgrade: Upgrade): number {
	return state.market.filter((u) => u === upgrade).length;
}

function canOffer(state: GameState, upgrade: Upgrade, rollable: readonly Upgrade[]): boolean {
	return rollable.includes(upgrade) && state.supply[upgrade] > 0 && marketCount(state, upgrade) < marketTypeCap(state);
}

/**
 * Refill the market up to one card per player. Unsold cards stay. Each empty
 * slot is filled by rolling the phase die, rerolling while the rolled type is
 * exhausted or already at the market cap; if no rollable type can legally be
 * added, the slot stays empty.
 */
export function refillMarket(state: GameState): void {
	const { sides, offset } = marketDie(state);
	const rollable = UPGRADE_BY_ROLL.slice(offset, offset + sides);
	const slots = state.players.filter((p) => !p.dropped).length;

	while (state.market.length < slots) {
		if (!rollable.some((u) => canOffer(state, u, rollable))) {
			return;
		}
		let upgrade: Upgrade | undefined;
		// Roll; on a card that can't be offered, cascade to the next
		// lower-numbered offerable card down to the era floor, else reroll.
		for (let i = 0; i < 100 && upgrade === undefined; i++) {
			const rolledIndex = rollDie(state, sides) + offset - 1;
			for (let idx = rolledIndex; idx >= offset; idx--) {
				const candidate = UPGRADE_BY_ROLL[idx] as Upgrade;
				if (canOffer(state, candidate, rollable)) {
					upgrade = candidate;
					break;
				}
			}
		}
		// Deterministic fallback if the bounded rerolls all failed.
		upgrade ??= rollable.find((u) => canOffer(state, u, rollable));
		if (upgrade === undefined) {
			return;
		}
		state.supply[upgrade] -= 1;
		state.market.push(upgrade);
	}
}

/**
 * Kicker expansion: refill the Kicker slots from the current era's pile. The
 * Kicker era follows the game era (leader VP), not the piles: when the era
 * advances, leftover Kicker cards of the ended era — in the slots and in that
 * era's pile — are returned to the box and the slots refill from the new era.
 */
export function refillKickers(state: GameState): void {
	if (state.options.kicker !== true) {
		return;
	}
	const era = colonyEra(state);
	if (era > state.kickerEra) {
		const ended = state.kickerEra;
		state.kickerMarket = state.kickerMarket.filter((k) => KICKER_SPECS[k].era !== ended);
		state.kickerPiles[ended] = [];
		state.kickerEra = era;
	}
	const { slots } = kickerSetup(state.players.filter((p) => !p.dropped).length);
	for (let guard = 0; guard < 10 && state.kickerMarket.length < slots; guard++) {
		const pile = state.kickerPiles[state.kickerEra];
		if (pile.length === 0) {
			return; // The current era's pile is exhausted: no more Kicker cards.
		}
		const card = pile.pop() as Kicker;
		state.kickerMarket.push(card);
	}
}
