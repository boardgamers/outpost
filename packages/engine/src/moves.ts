import { FACTORIES, ROBOT_COST, UPGRADE_SPECS, VICTORY_VP } from "./data.js";
import { refillMarket } from "./market.js";
import { producePlayer } from "./production.js";
import {
	canBuyFactory,
	computePurchaseOrder,
	countingHandSize,
	handCapacity,
	handValue,
	populationCost,
	populationMax,
	robotMax,
	scores,
	setup,
	upgradeDiscount,
} from "./state.js";
import { sanitizeMove } from "./sanitize.js";
import type { GameState, Move, MoveInfo, PlayerState, ProductionCard, Upgrade } from "./types.js";

/** Safety valve: no sane game lasts anywhere near this long. */
export const MAX_ROUNDS = 200;

// During replay, rounds are driven by the "round" log entries (which carry the
// market and production draws) instead of the PRNG, so ending a round must not
// start the next one.
let replayMode = false;

export function setReplayMode(value: boolean): void {
	replayMode = value;
}

export function initGame(players: number, options: Record<string, unknown>, seed: string): GameState {
	const state = setup(players, options, seed);
	beginRound(state);
	return state;
}

export function beginRound(state: GameState): void {
	state.round += 1;
	state.purchaseOrder = computePurchaseOrder(state);
	refillMarket(state);

	const produced: { player: number; cards: ProductionCard[] }[] = [];
	for (const seat of state.purchaseOrder) {
		const player = state.players[seat] as PlayerState;
		produced.push({ player: seat, cards: producePlayer(state, player) });
	}

	state.log.push({
		type: "round",
		round: state.round,
		purchaseOrder: [...state.purchaseOrder],
		market: [...state.market],
		supply: { ...state.supply },
		produced,
	});

	enterDiscardPhase(state);
}

export function enterDiscardPhase(state: GameState): void {
	let anyDiscard = false;
	for (const player of state.players) {
		player.done = false;
		player.mustDiscard = !player.dropped && countingHandSize(player) > handCapacity(player);
		anyDiscard ||= player.mustDiscard;
	}
	if (anyDiscard) {
		state.phase = "discard";
	} else {
		startActions(state);
	}
}

function startActions(state: GameState): void {
	state.phase = "actions";
	const next = state.purchaseOrder.find((seat) => {
		const p = state.players[seat];
		return p && !p.dropped && !p.done;
	});
	if (next === undefined) {
		endRound(state);
	} else {
		state.activeSeat = next;
	}
}

function endRound(state: GameState): void {
	const best = Math.max(0, ...scores(state));
	if (best >= VICTORY_VP || state.round >= MAX_ROUNDS || activePlayers(state) <= 1) {
		finishGame(state);
		return;
	}
	if (replayMode) {
		return;
	}
	// A stalled economy (nobody can produce) would loop forever; call it a draw.
	if (
		state.decks.ore.length + state.discards.ore.length + state.decks.water.length + state.discards.water.length ===
		0
	) {
		finishGame(state);
		return;
	}
	beginRound(state);
}

function finishGame(state: GameState): void {
	state.ended = true;
	state.phase = "ended";
	state.auction = null;
	state.log.push({ type: "end", scores: scores(state) });
}

function activePlayers(state: GameState): number {
	return state.players.filter((p) => !p.dropped).length;
}

function err(message: string): never {
	throw new Error(message);
}

function getPlayer(state: GameState, seat: number): PlayerState {
	const player = state.players[seat];
	if (!player) {
		err(`invalid player ${seat}`);
	}
	if (player.dropped) {
		err(`player ${seat} has dropped`);
	}
	return player;
}

function sanitizeIndices(raw: unknown, max: number, label: string): number[] {
	if (!Array.isArray(raw)) {
		err(`${label}: expected an array of card indices`);
	}
	const indices = raw.map((i) => {
		if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= max) {
			err(`${label}: invalid index ${String(i)}`);
		}
		return i;
	});
	if (new Set(indices).size !== indices.length) {
		err(`${label}: duplicate indices`);
	}
	return indices;
}

/** Validate then move the selected cards to the discard piles. Returns their total value. */
function spendCards(state: GameState, player: PlayerState, indices: number[], minValue: number): number {
	const total = indices.reduce((sum, i) => sum + (player.hand[i]?.v ?? 0), 0);
	// A stripped log carries hidden card values (-1); the server already
	// validated these payments, so replay must not re-check affordability.
	if (total < minValue && !replayMode) {
		err(`payment of ${total} is less than the required ${minValue}`);
	}
	removeCards(state, player, indices);
	player.spent += total;
	return total;
}

function removeCards(state: GameState, player: PlayerState, indices: number[]): void {
	const sorted = [...indices].sort((a, b) => b - a);
	for (const i of sorted) {
		const card = player.hand.splice(i, 1)[0] as ProductionCard;
		state.discards[card.t].push(card.v);
	}
}

export function applyMove(state: GameState, rawMove: Move | unknown, seat: number): GameState {
	if (state.ended) {
		err("the game has ended");
	}
	// Deep-validate the untrusted payload and rebuild it with only whitelisted
	// fields before it is interpreted or logged.
	const move = sanitizeMove(rawMove);
	if (typeof seat !== "number" || !Number.isInteger(seat)) {
		err("invalid player");
	}
	const player = getPlayer(state, seat);
	let info: MoveInfo | undefined;

	switch (move.action) {
		case "discard":
			info = moveDiscard(state, move, seat, player);
			break;
		case "auction":
			info = moveAuction(state, move, seat, player);
			break;
		case "bid":
			info = moveBid(state, move, seat, player);
			break;
		case "bidPass":
			info = moveBidPass(state, move, seat);
			break;
		case "pay":
			info = movePay(state, move, seat, player);
			break;
		case "buyFactory":
			info = moveBuyFactory(state, move, seat, player);
			break;
		case "buyPopulation":
			info = moveBuyPopulation(state, move, seat, player);
			break;
		case "buyRobots":
			info = moveBuyRobots(state, move, seat, player);
			break;
		case "endTurn":
			info = moveEndTurn(state, move, seat, player);
			break;
		default:
			err(`unknown action ${String((move as { action: string }).action)}`);
	}

	state.moveCount += 1;
	state.log.push(info ? { type: "move", player: seat, move, info } : { type: "move", player: seat, move });
	postMove(state, move);
	return state;
}

/** Phase transitions that must happen after the move is logged (may end the round/game). */
function postMove(state: GameState, move: Move): void {
	if (state.phase === "discard" && !state.players.some((p) => p.mustDiscard)) {
		startActions(state);
		return;
	}
	if (move.action === "endTurn") {
		startActions(state);
	}
}

function moveDiscard(
	state: GameState,
	move: Move & { action: "discard" },
	seat: number,
	player: PlayerState
): MoveInfo {
	if (state.phase !== "discard" || !player.mustDiscard) {
		err("no discard expected from this player");
	}
	const indices = sanitizeIndices(move.cards, player.hand.length, "discard");
	const remaining = player.hand.filter((_, i) => !indices.includes(i));
	const counting = remaining.filter((c) => c.t !== "research" && c.t !== "microbiotics").length;
	if (counting > handCapacity(player)) {
		err(`still ${counting} cards over the hand capacity of ${handCapacity(player)}`);
	}
	removeCards(state, player, indices);
	player.mustDiscard = false;
	return { discarded: indices.length };
}

function requireActionTurn(state: GameState, seat: number, player: PlayerState): void {
	if (state.phase !== "actions") {
		err("not in the action phase");
	}
	if (state.activeSeat !== seat) {
		err("not this player's action turn");
	}
	if (player.done) {
		err("this player has already ended their turn");
	}
}

function moveAuction(
	state: GameState,
	move: Move & { action: "auction" },
	seat: number,
	player: PlayerState
): MoveInfo {
	requireActionTurn(state, seat, player);
	const { marketIndex, bid } = move;
	if (!Number.isInteger(marketIndex) || marketIndex < 0 || marketIndex >= state.market.length) {
		err("invalid market index");
	}
	const upgrade = state.market[marketIndex] as Upgrade;
	if (!Number.isInteger(bid) || bid < UPGRADE_SPECS[upgrade].price) {
		err(`opening bid must be at least ${UPGRADE_SPECS[upgrade].price}`);
	}
	assertCanPayBid(player, upgrade, bid);
	state.phase = "auction";
	state.auction = {
		marketIndex,
		upgrade,
		auctioneer: seat,
		highBid: bid,
		highBidder: seat,
		passed: [],
		activeBidder: seat,
	};
	advanceBidder(state);
	return { upgrade };
}

function assertCanPayBid(player: PlayerState, upgrade: Upgrade, bid: number): void {
	if (replayMode) {
		return;
	}
	const due = Math.max(0, bid - upgradeDiscount(player, upgrade));
	if (handValue(player) < due) {
		err(`cannot afford a bid of ${bid} (needs ${due}, holds ${handValue(player)})`);
	}
}

function biddingOrder(state: GameState): number[] {
	const auction = state.auction;
	if (!auction) {
		err("no auction in progress");
	}
	const order = state.purchaseOrder;
	const start = order.indexOf(auction.auctioneer);
	return order.map((_, i) => order[(start + i) % order.length] as number);
}

function advanceBidder(state: GameState): void {
	const auction = state.auction;
	if (!auction) {
		err("no auction in progress");
	}
	const order = biddingOrder(state);
	const from = order.indexOf(auction.activeBidder);
	for (let step = 1; step <= order.length; step++) {
		const seat = order[(from + step) % order.length] as number;
		if (seat === auction.highBidder) {
			state.phase = "auctionPayment";
			auction.activeBidder = seat;
			return;
		}
		const p = state.players[seat];
		if (p && !p.dropped && !auction.passed.includes(seat)) {
			auction.activeBidder = seat;
			return;
		}
	}
	state.phase = "auctionPayment";
	auction.activeBidder = auction.highBidder;
}

function moveBid(state: GameState, move: Move & { action: "bid" }, seat: number, player: PlayerState): MoveInfo {
	const auction = state.auction;
	if (state.phase !== "auction" || !auction || auction.activeBidder !== seat) {
		err("not this player's turn to bid");
	}
	if (!Number.isInteger(move.amount) || move.amount <= auction.highBid) {
		err(`bid must be higher than ${auction.highBid}`);
	}
	assertCanPayBid(player, auction.upgrade, move.amount);
	auction.highBid = move.amount;
	auction.highBidder = seat;
	advanceBidder(state);
	return { upgrade: auction.upgrade };
}

function moveBidPass(state: GameState, _move: Move & { action: "bidPass" }, seat: number): MoveInfo {
	const auction = state.auction;
	if (state.phase !== "auction" || !auction || auction.activeBidder !== seat) {
		err("not this player's turn to bid");
	}
	auction.passed.push(seat);
	advanceBidder(state);
	return { upgrade: auction.upgrade };
}

function movePay(state: GameState, move: Move & { action: "pay" }, seat: number, player: PlayerState): MoveInfo {
	const auction = state.auction;
	if (state.phase !== "auctionPayment" || !auction || auction.highBidder !== seat) {
		err("no payment expected from this player");
	}
	const due = Math.max(0, auction.highBid - upgradeDiscount(player, auction.upgrade));
	const indices = sanitizeIndices(move.cards, player.hand.length, "pay");
	const paid = spendCards(state, player, indices, due);

	const upgrade = auction.upgrade;
	state.market.splice(auction.marketIndex, 1);
	player.upgrades[upgrade] += 1;
	const freeFactory = UPGRADE_SPECS[upgrade].freeFactory;
	if (freeFactory) {
		player.factories.push({ type: freeFactory, manned: false });
	}

	state.messages.push(`${player.name} won ${UPGRADE_SPECS[upgrade].name} for ${auction.highBid}`);
	state.phase = "actions";
	state.activeSeat = auction.auctioneer;
	state.auction = null;

	const auctioneer = state.players[state.activeSeat];
	if (!auctioneer || auctioneer.dropped || auctioneer.done) {
		startActions(state);
	}
	return { upgrade, paid };
}

function moveBuyFactory(
	state: GameState,
	move: Move & { action: "buyFactory" },
	seat: number,
	player: PlayerState
): MoveInfo {
	requireActionTurn(state, seat, player);
	const type = move.factory;
	const spec = FACTORIES[type];
	if (!canBuyFactory(player, type)) {
		err(`cannot build ${type} factories`);
	}
	const indices = sanitizeIndices(move.cards, player.hand.length, "buyFactory");
	if (spec.needsResearchCard && !indices.some((i) => player.hand[i]?.t === "research")) {
		err("buying a New Chemicals factory requires spending a research card");
	}
	const paid = spendCards(state, player, indices, spec.cost);
	player.factories.push({ type, manned: false });
	return { paid };
}

function moveBuyPopulation(
	state: GameState,
	move: Move & { action: "buyPopulation" },
	seat: number,
	player: PlayerState
): MoveInfo {
	requireActionTurn(state, seat, player);
	const count = move.count;
	if (!Number.isInteger(count) || count < 1) {
		err("invalid population count");
	}
	if (player.population + count > populationMax(player)) {
		err(`population limit is ${populationMax(player)}`);
	}
	const indices = sanitizeIndices(move.cards, player.hand.length, "buyPopulation");
	const paid = spendCards(state, player, indices, populationCost(player) * count);
	player.population += count;
	return { paid };
}

function moveBuyRobots(
	state: GameState,
	move: Move & { action: "buyRobots" },
	seat: number,
	player: PlayerState
): MoveInfo {
	requireActionTurn(state, seat, player);
	if (player.upgrades.robots === 0) {
		err("requires the Robots upgrade");
	}
	const count = move.count;
	if (!Number.isInteger(count) || count < 1) {
		err("invalid robot count");
	}
	if (player.robots + count > robotMax(player)) {
		err(`robot limit is ${robotMax(player)}`);
	}
	const indices = sanitizeIndices(move.cards, player.hand.length, "buyRobots");
	const paid = spendCards(state, player, indices, ROBOT_COST * count);
	player.robots += count;
	return { paid };
}

function moveEndTurn(
	state: GameState,
	move: Move & { action: "endTurn" },
	seat: number,
	player: PlayerState
): MoveInfo {
	requireActionTurn(state, seat, player);
	const manned = sanitizeIndices(move.manned, player.factories.length, "endTurn");
	if (manned.length > player.population + player.robots) {
		err(`only ${player.population + player.robots} operators available`);
	}
	player.factories.forEach((factory, i) => {
		factory.manned = manned.includes(i);
	});
	player.done = true;
	return {};
}

export function dropPlayer(state: GameState, seat: number): GameState {
	const player = state.players[seat];
	if (!player || player.dropped) {
		return state;
	}
	player.dropped = true;
	player.mustDiscard = false;
	player.done = true;
	for (const factory of player.factories) {
		factory.manned = false;
	}
	state.purchaseOrder = state.purchaseOrder.filter((s) => s !== seat);

	if (state.ended) {
		return state;
	}
	if (activePlayers(state) <= 1) {
		finishGame(state);
		return state;
	}

	const auction = state.auction;
	if (auction && (state.phase === "auction" || state.phase === "auctionPayment")) {
		if (auction.highBidder === seat) {
			// The would-be buyer is gone: cancel the auction, the card stays in the market.
			state.phase = "actions";
			state.auction = null;
			state.activeSeat = auction.auctioneer;
			const auctioneer = state.players[state.activeSeat];
			if (!auctioneer || auctioneer.dropped || auctioneer.done) {
				startActions(state);
			}
		} else if (auction.activeBidder === seat) {
			auction.passed.push(seat);
			advanceBidder(state);
		}
		return state;
	}
	if (state.phase === "discard" && !state.players.some((p) => p.mustDiscard)) {
		startActions(state);
		return state;
	}
	if (state.phase === "actions" && state.activeSeat === seat) {
		startActions(state);
	}
	return state;
}
