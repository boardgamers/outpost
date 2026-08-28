import { FACTORIES, MEGA_CARDS, PRODUCTION_DECKS, UPGRADE_SPECS } from "./data.js";
import { applyMove } from "./moves.js";
import {
	bestPayment,
	canBuyFactory,
	handCapacity,
	handValue,
	megaEligible,
	populationCost,
	populationMax,
	upgradeDiscount,
} from "./state.js";
import type { GameState, Move, PlayerState, Resource, TurnBuy, Upgrade } from "./types.js";

/** Pick a legal (and mildly sensible) move for the player, then apply it. */
export function moveAI(state: GameState, seat: number): GameState {
	return applyMove(state, chooseMove(state, seat), seat);
}

export function chooseMove(state: GameState, seat: number): Move {
	const player = state.players[seat];
	if (!player || player.dropped) {
		throw new Error(`no move expected from player ${seat}`);
	}
	switch (state.phase) {
		case "mega":
			return chooseMega(state, player);
		case "discard":
			return chooseDiscard(player);
		case "auction": {
			const auction = state.auction;
			// fastBid: bid the max affordable when the list price is reachable,
			// otherwise pass (the sealed bid keeps a weak hand hidden).
			if (auction?.bids) {
				const max = handValue(player) + upgradeDiscount(player, auction.upgrade);
				if (max >= UPGRADE_SPECS[auction.upgrade].price) {
					return { action: "bid", amount: max };
				}
			}
			return { action: "bidPass" };
		}
		case "auctionPayment": {
			const auction = state.auction;
			if (!auction) {
				throw new Error("no auction in progress");
			}
			const due = Math.max(0, auction.highBid - upgradeDiscount(player, auction.upgrade));
			return { action: "pay", cards: bestPayment(player, due) ?? player.hand.map((_, i) => i) };
		}
		case "actions":
			return chooseAction(state, player);
		default:
			throw new Error(`no move expected in phase ${state.phase}`);
	}
}

/**
 * Confirm the mega choice: convert a group of 4 pending draws when the fixed
 * mega value beats the expected value of those 4 draws (a conservative pick —
 * it ignores the hand-capacity pressure a mega relieves).
 */
function chooseMega(state: GameState, player: PlayerState): Move {
	const pending = player.pendingMega ?? [];
	const eligible = megaEligible(state, player);
	const picked: number[] = [];
	for (const [resource, groups] of Object.entries(eligible)) {
		const mega = MEGA_CARDS[resource as Resource];
		if (!mega) {
			continue;
		}
		const idx = pending.flatMap((c, i) => (c.t === resource ? [i] : []));
		for (let g = 0; g < (groups as number); g++) {
			const group = idx.slice(g * 4, g * 4 + 4);
			const expected = group.reduce((sum, i) => sum + (pending[i]?.v ?? 0), 0);
			if (mega.value >= expected) {
				picked.push(...group);
			}
		}
	}
	return { action: "mega", cards: picked };
}

function chooseDiscard(player: PlayerState): Move {
	const cap = handCapacity(player);
	// Discard the cheapest counting cards until under the cap. A mega card
	// counts as 4, so it is only discarded when nothing smaller suffices.
	const counting = player.hand
		.map((card, index) => ({ card, index, weight: card.m ? 4 : 1 }))
		.filter(({ card }) => card.t !== "research" && card.t !== "microbiotics")
		.sort((a, b) => a.card.v - b.card.v);
	let size = counting.reduce((sum, e) => sum + e.weight, 0);
	const picked: number[] = [];
	for (const e of counting) {
		if (size <= cap) {
			break;
		}
		picked.push(e.index);
		size -= e.weight;
	}
	return { action: "discard", cards: picked };
}

function chooseAction(state: GameState, player: PlayerState): Move {
	const cash = handValue(player);

	// 1. Auction the highest-VP upgrade we can afford at list price.
	let bestIndex = -1;
	let bestVp = -1;
	state.market.forEach((upgrade, index) => {
		const spec = UPGRADE_SPECS[upgrade];
		const due = Math.max(0, spec.price - upgradeDiscount(player, upgrade));
		if (cash >= due && spec.vp > bestVp) {
			bestVp = spec.vp;
			bestIndex = index;
		}
	});
	if (bestIndex >= 0) {
		const upgrade = state.market[bestIndex] as Upgrade;
		return { action: "auction", marketIndex: bestIndex, bid: UPGRADE_SPECS[upgrade].price };
	}

	return chooseTurn(player);
}

/** Greedily assemble a whole turn (purchases + manning) as one composite endTurn move. */
function chooseTurn(player: PlayerState): Move {
	// Simulate the buys on a private copy so each step's card indices are
	// relative to the hand as the engine will see it at that step.
	const sim = JSON.parse(JSON.stringify(player)) as PlayerState;
	const buys: TurnBuy[] = [];
	const spend = (due: number): number[] => {
		const cards = bestPayment(sim, due) ?? [];
		for (const i of [...cards].sort((a, b) => b - a)) {
			sim.hand.splice(i, 1);
		}
		return cards;
	};

	for (let guard = 0; guard < 100; guard++) {
		const cash = handValue(sim);

		// 2. Recruit population while there are factories to man.
		const unmanned = sim.factories.length - (sim.population + sim.robots);
		if (unmanned > 0 && sim.population < populationMax(sim) && cash >= populationCost(sim)) {
			const cards = spend(populationCost(sim));
			buys.push({ buy: "population", count: 1, cards });
			sim.population += 1;
			continue;
		}

		// 3. Expand production while there are operators (or room) for it.
		const type = (["titanium", "water", "ore"] as const).find((t) => {
			const cost = FACTORIES[t].cost;
			return (
				canBuyFactory(sim, t) &&
				cash >= cost &&
				sim.factories.length < populationMax(sim) + sim.robots &&
				(t === "titanium" || cash >= cost + populationCost(sim))
			);
		});
		if (type) {
			const cards = spend(FACTORIES[type].cost);
			buys.push({ buy: "factory", factory: type, cards });
			sim.factories.push({ type, manned: false });
			continue;
		}
		break;
	}

	// 4. Man the most valuable factories and end the turn.
	const operators = sim.population + sim.robots;
	const manned = sim.factories
		.map((factory, index) => ({ index, value: PRODUCTION_DECKS[factory.type].average }))
		.sort((a, b) => b.value - a.value)
		.slice(0, operators)
		.map((e) => e.index);
	return { action: "endTurn", buys, manned };
}
