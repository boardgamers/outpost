import { FACTORIES, PRODUCTION_DECKS, UPGRADE_SPECS } from "./data.js";
import { applyMove } from "./moves.js";
import { canBuyFactory, handCapacity, handValue, populationCost, populationMax, upgradeDiscount } from "./state.js";
import type { GameState, Move, PlayerState, Upgrade } from "./types.js";

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
		case "discard":
			return chooseDiscard(player);
		case "auction":
			return { action: "bidPass" };
		case "auctionPayment": {
			const auction = state.auction;
			if (!auction) {
				throw new Error("no auction in progress");
			}
			const due = Math.max(0, auction.highBid - upgradeDiscount(player, auction.upgrade));
			return { action: "pay", cards: choosePayment(player, due) };
		}
		case "actions":
			return chooseAction(state, player);
		default:
			throw new Error(`no move expected in phase ${state.phase}`);
	}
}

function chooseDiscard(player: PlayerState): Move {
	const cap = handCapacity(player);
	const counting = player.hand
		.map((card, index) => ({ card, index }))
		.filter(({ card }) => card.t !== "research" && card.t !== "microbiotics")
		.sort((a, b) => a.card.v - b.card.v);
	const excess = Math.max(0, counting.length - cap);
	return { action: "discard", cards: counting.slice(0, excess).map((e) => e.index) };
}

/** Smallest cards first until the amount is covered — burns change, keeps big cards. */
function choosePayment(player: PlayerState, due: number, mustIncludeResearch = false): number[] {
	const picked: number[] = [];
	let total = 0;
	if (mustIncludeResearch) {
		const research = player.hand
			.map((card, index) => ({ card, index }))
			.filter(({ card }) => card.t === "research")
			.sort((a, b) => a.card.v - b.card.v)[0];
		if (research) {
			picked.push(research.index);
			total += research.card.v;
		}
	}
	const ascending = player.hand
		.map((card, index) => ({ card, index }))
		.filter(({ index }) => !picked.includes(index))
		.sort((a, b) => a.card.v - b.card.v);
	for (const { card, index } of ascending) {
		if (total >= due) {
			break;
		}
		picked.push(index);
		total += card.v;
	}
	return picked;
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

	// 2. Recruit population while there are factories to man.
	const unmanned = player.factories.length - (player.population + player.robots);
	if (unmanned > 0 && player.population < populationMax(player) && cash >= populationCost(player)) {
		return { action: "buyPopulation", count: 1, cards: choosePayment(player, populationCost(player)) };
	}

	// 3. Expand production while there are operators (or room) for it.
	for (const type of ["titanium", "water", "ore"] as const) {
		const cost = FACTORIES[type].cost;
		if (
			canBuyFactory(player, type) &&
			cash >= cost &&
			player.factories.length < populationMax(player) + player.robots
		) {
			if (type === "titanium" || cash >= cost + populationCost(player)) {
				return { action: "buyFactory", factory: type, cards: choosePayment(player, cost) };
			}
		}
	}

	// 4. Man the most valuable factories and end the turn.
	const operators = player.population + player.robots;
	const manned = player.factories
		.map((factory, index) => ({ index, value: PRODUCTION_DECKS[factory.type].average }))
		.sort((a, b) => b.value - a.value)
		.slice(0, operators)
		.map((e) => e.index);
	return { action: "endTurn", manned };
}
