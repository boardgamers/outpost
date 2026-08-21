import { MID_THRESHOLD, UPGRADE_BY_ROLL } from "./data.js";
import { rollDie } from "./prng.js";
import { bigThreshold, scores } from "./state.js";
import type { GameState, Upgrade } from "./types.js";

/** Which die is rolled to refill the market, based on the current leader's VP. */
export function marketDie(state: GameState): { sides: number; offset: number } {
	const best = Math.max(0, ...scores(state));
	if (best >= bigThreshold(state)) {
		return { sides: 12, offset: 1 }; // d12+1: upgrades 2-13
	}
	if (best >= MID_THRESHOLD) {
		return { sides: 10, offset: 0 }; // d10: upgrades 1-10
	}
	return { sides: 4, offset: 0 }; // d4: upgrades 1-4
}

/** Max copies of one upgrade type in the market: half the players, rounded down, min 1. */
export function marketTypeCap(state: GameState): number {
	return Math.max(1, Math.floor(state.players.length / 2));
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
		// Bounded rerolls; falls back to the first offerable type for determinism.
		for (let i = 0; i < 100 && upgrade === undefined; i++) {
			const rolled = UPGRADE_BY_ROLL[rollDie(state, sides) + offset - 1] as Upgrade;
			if (canOffer(state, rolled, rollable)) {
				upgrade = rolled;
			}
		}
		upgrade ??= rollable.find((u) => canOffer(state, u, rollable));
		if (upgrade === undefined) {
			return;
		}
		state.supply[upgrade] -= 1;
		state.market.push(upgrade);
	}
}
