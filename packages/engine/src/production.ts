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
	applyKickerProduction(state, player, produced);
	player.pendingMega = produced;
	return produced;
}

/**
 * Kicker expansion production effects. Ice Prospector / Refinery: if any
 * water/titanium was drawn, draw one extra of that type and discard the
 * cheapest of the just-drawn cards of that type (the obvious choice, applied
 * automatically). Smelter: one extra ore card per two operated ore factories.
 */
function applyKickerProduction(state: GameState, player: PlayerState, produced: ProductionCard[]): void {
	const prospect = (resource: "water" | "titanium", count: number): void => {
		if (count === 0 || !produced.some((c) => c.t === resource)) {
			return;
		}
		for (let i = 0; i < count; i++) {
			const value = drawCard(state, resource);
			if (value === undefined) {
				break;
			}
			produced.push({ t: resource, v: value });
			// Discard the cheapest of this phase's draws of the type.
			let worst = -1;
			for (let j = 0; j < produced.length; j++) {
				const c = produced[j] as ProductionCard;
				if (c.t === resource && (worst === -1 || c.v < (produced[worst] as ProductionCard).v)) {
					worst = j;
				}
			}
			if (worst >= 0) {
				const [discarded] = produced.splice(worst, 1);
				state.discards[resource].push((discarded as ProductionCard).v);
			}
		}
	};
	prospect("water", player.kickers.iceProspector);
	prospect("titanium", player.kickers.refinery);

	if (player.kickers.smelter > 0) {
		const oreFactories = player.factories.filter((f) => f.type === "ore" && f.manned).length;
		const bonus = Math.floor(oreFactories / 2) * player.kickers.smelter;
		for (let i = 0; i < bonus; i++) {
			const value = drawCard(state, "ore");
			if (value === undefined) {
				break;
			}
			produced.push({ t: "ore", v: value });
		}
	}
}
