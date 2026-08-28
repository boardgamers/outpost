import { UPGRADE_SPECS } from "./data.js";
import { drawCard } from "./state.js";
import { UPGRADES } from "./types.js";
import type { GameState, PlayerState, ProductionCard } from "./types.js";

/**
 * Draw production for one player: one card per manned factory plus upgrade
 * freebies. The draws are staged in `pendingMega` (not yet in the hand) so the
 * player can exchange full groups of 4 draws of a mega resource for a fixed
 * Mega card (rule 12.1) via the "mega" move.
 */
export function producePlayer(state: GameState, player: PlayerState): ProductionCard[] {
	const produced: ProductionCard[] = [];
	for (const factory of player.factories) {
		if (factory.manned) {
			const value = drawCard(state, factory.type);
			if (value !== undefined) {
				produced.push({ t: factory.type, v: value });
			}
		}
	}
	for (const u of UPGRADES) {
		const resource = UPGRADE_SPECS[u].produces;
		if (!resource) {
			continue;
		}
		for (let i = 0; i < player.upgrades[u]; i++) {
			const value = drawCard(state, resource);
			if (value !== undefined) {
				produced.push({ t: resource, v: value });
			}
		}
	}
	player.pendingMega = produced;
	return produced;
}
