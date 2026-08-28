import { FACTORIES, KICKER_SPECS, MEGA_CARDS, ROBOT_COST, UPGRADE_SPECS, VICTORY_VP } from "./data.js";
import { refillKickers, refillMarket, updateEraStreaks } from "./market.js";
import { producePlayer } from "./production.js";
import {
	canBuyFactory,
	computePurchaseOrder,
	countingHandSize,
	exchangeResources,
	handCapacity,
	handValue,
	hasExchange,
	megaEligible,
	mustAutoPassBid,
	populationCost,
	populationMax,
	publicMaxBid,
	robotMax,
	scores,
	setup,
	upgradeDiscount,
} from "./state.js";
import { sanitizeMove } from "./sanitize.js";
import type {
	GameState,
	Kicker,
	Move,
	MoveInfo,
	PlayerState,
	ProductionCard,
	Resource,
	TurnBuy,
	Upgrade,
} from "./types.js";

/** Safety valve: no sane game lasts anywhere near this long. */
export const MAX_ROUNDS = 200;

// During replay, rounds are driven by the "round" log entries (which carry the
// market and production draws) instead of the PRNG, so ending a round must not
// start the next one.
let replayMode = false;

export function setReplayMode(value: boolean): void {
	replayMode = value;
}

// Seats the currently replayed move auto-passed out of the auction (from the
// logged MoveInfo). The live auto-pass check can use true hand values (the
// autoPassBids setting), which a stripped log cannot recompute, so replay
// applies the recorded seats verbatim instead.
let replayAutoPassed: number[] = [];

export function setReplayAutoPassed(seats: number[]): void {
	replayAutoPassed = seats;
}

// fastBid resolution recorded on the replayed move (winning bid, runner-up
// bid, winner seat). A stripped log hides the other sealed bids, so replay
// cannot recompute the outcome and applies the recorded one verbatim instead.
let replayFastResolve: { winningBid: number; secondBid: number; winner: number } | null = null;

export function setReplayFastResolve(winningBid: number, secondBid: number, winner: number): void {
	replayFastResolve = { winningBid, secondBid, winner };
}

// The exchange resolution recorded on the replayed move (index into the
// target's hand of the returned card, -1 for "gave the card back"). A stripped
// log hides the target's card values, so the return cannot be recomputed.
let replayExchangeTake = -1;

export function setReplayExchangeTake(take: number): void {
	replayExchangeTake = take;
}

export function isFastBid(state: GameState): boolean {
	return state.options.fastBid === true;
}

export function initGame(players: number, options: Record<string, unknown>, seed: string): GameState {
	const state = setup(players, options, seed);
	beginRound(state);
	return state;
}

export function beginRound(state: GameState): void {
	state.round += 1;
	state.purchaseOrder = computePurchaseOrder(state);
	// The "very rare" era fallback is evaluated as the round begins, before the
	// refill draws down the supply.
	updateEraStreaks(state);
	refillMarket(state);
	refillKickers(state);

	const produced: { player: number; cards: ProductionCard[] }[] = [];
	const megaGroups: { player: number; groups: Partial<Record<Resource, number>> }[] = [];
	for (const seat of state.purchaseOrder) {
		const player = state.players[seat] as PlayerState;
		produced.push({ player: seat, cards: producePlayer(state, player) });
		megaGroups.push({ player: seat, groups: { ...(player.megaGroups ?? {}) } });
	}

	state.log.push({
		type: "round",
		round: state.round,
		purchaseOrder: [...state.purchaseOrder],
		market: [...state.market],
		supply: { ...state.supply },
		kickerMarket: [...state.kickerMarket],
		kickerEra: state.kickerEra,
		kickerPiles: { 1: [...state.kickerPiles[1]], 2: [...state.kickerPiles[2]], 3: [...state.kickerPiles[3]] },
		eraStreak4: state.eraStreak4,
		eraStreak10: state.eraStreak10,
		produced,
		megaGroups,
	});

	enterMegaPhase(state);
}

/**
 * Production is staged in pendingMega. Players with no mega option take their
 * draws as singles immediately; only those who could convert a group of 4 stay
 * in the mega phase to choose.
 */
export function enterMegaPhase(state: GameState): void {
	let anyPending = false;
	for (const player of state.players) {
		player.done = false;
		player.mustDiscard = false;
		if (player.dropped) {
			player.pendingMega = [];
			continue;
		}
		if (Object.keys(megaEligible(state, player)).length === 0) {
			player.hand.push(...(player.pendingMega ?? []));
			player.pendingMega = [];
		} else {
			anyPending = true;
		}
	}
	if (anyPending) {
		state.phase = "mega";
	} else {
		enterDiscardPhase(state);
	}
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
		enterExchangePhase(state);
	}
}

/**
 * Kicker expansion: the Wily Trader / Merchant House exchange step runs just
 * before the discard phase ends, after all excess cards are discarded. Owners
 * act in player order; seats with no legal exchange are skipped. With no
 * Wily Trader / Merchant House in play at all, go straight to actions.
 */
export function enterExchangePhase(state: GameState): void {
	state.exchange = null;
	const next = state.purchaseOrder.find((seat) => hasExchange(state, seat));
	if (next === undefined) {
		startActions(state);
		return;
	}
	state.phase = "exchange";
	state.exchange = { seat: next, acted: [], parked: [] };
}

/** Advance to the next owner with a legal exchange, or end the exchange step. */
function advanceExchange(state: GameState): void {
	const exchange = state.exchange;
	if (!exchange) {
		err("no exchange in progress");
	}
	// Mark the seat that just acted so it is not asked again this phase (an
	// owner keeps a tradable hand after trading, so without this they would be
	// re-selected forever).
	exchange.acted.push(exchange.seat);
	const order = state.purchaseOrder;
	const from = order.indexOf(exchange.seat);
	for (let step = 1; step <= order.length; step++) {
		const seat = order[(from + step) % order.length] as number;
		if (!exchange.acted.includes(seat) && hasExchange(state, seat)) {
			exchange.seat = seat;
			return;
		}
	}
	// No more exchanges: the step is over. Return every card parked on a Wily
	// Trader / Merchant House to its owner's hand now that the phase has ended.
	for (const { seat, card } of exchange.parked) {
		(state.players[seat] as PlayerState).hand.push(card);
	}
	state.exchange = null;
	startActions(state);
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
	const final = scores(state);
	const best = Math.max(...final);
	const winners = state.players.filter((_, i) => final[i] === best).map((p) => p.name);
	state.messages.push(`Game over: ${winners.join(" and ")} win${winners.length > 1 ? "" : "s"} with ${best} VP`);
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
		if (card.m) {
			// A spent/discarded mega returns to its face-up pool (it was never
			// part of the shuffled deck).
			state.megaSupply[card.t] = (state.megaSupply[card.t] ?? 0) + 1;
		} else {
			state.discards[card.t].push(card.v);
		}
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
		case "mega":
			info = moveMega(state, move, seat, player);
			break;
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
		case "exchange":
			info = moveExchange(state, move, seat, player);
			break;
		case "exchangePass":
			info = moveExchangePass(state, seat);
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
	if (state.phase === "mega" && !state.players.some((p) => (p.pendingMega?.length ?? 0) > 0)) {
		enterDiscardPhase(state);
		return;
	}
	if (state.phase === "discard" && !state.players.some((p) => p.mustDiscard)) {
		enterExchangePhase(state);
		return;
	}
	if (move.action === "endTurn") {
		startActions(state);
	}
}

/**
 * Confirm the mega-vs-singles choice for the staged production draws. Any full
 * group of 4 pending draws of a mega resource may be exchanged for one fixed
 * Mega card (while the pool lasts); the rest joins the hand as singles.
 */
function moveMega(state: GameState, move: Move & { action: "mega" }, seat: number, player: PlayerState): MoveInfo {
	if (state.phase !== "mega" || (player.pendingMega?.length ?? 0) === 0) {
		err("no production pending for this player");
	}
	// The election is blind (rule 12.1): the player commits to a number of Mega
	// cards per resource before seeing the pending draw values. Each Mega card
	// consumes 4 pending draws of its resource (a group of 4 operated factories).
	const eligible = megaEligible(state, player);
	const take = move.take ?? {};
	for (const [resource, count] of Object.entries(take)) {
		if (!Number.isInteger(count) || count < 0 || count > (eligible[resource as Resource] ?? 0)) {
			err(`cannot take ${count} mega ${resource} card(s)`);
		}
	}
	const pending = player.pendingMega ?? [];
	const megas: ProductionCard[] = [];
	const consumed = new Set<number>();
	for (const [resource, count] of Object.entries(take)) {
		const mega = MEGA_CARDS[resource as Resource];
		if (!mega || !count) {
			continue;
		}
		// A Mega card is taken instead of the group's 4 draws. Consume those
		// pending draws; if the deck ran dry and fewer than 4 were produced, the
		// Mega is still granted (the player forgoes draws they could not make).
		const available = pending.flatMap((c, i) => (c.t === resource && !consumed.has(i) ? [i] : []));
		for (let g = 0; g < Math.min(count * 4, available.length); g++) {
			consumed.add(available[g] as number);
		}
		state.megaSupply[resource as Resource] = (state.megaSupply[resource as Resource] ?? 0) - count;
		for (let g = 0; g < count; g++) {
			megas.push({ t: resource as Resource, v: mega.value, m: true });
		}
	}
	// Everything validated; now mutate. Unconverted draws are kept as singles.
	const keep = pending.filter((_, i) => !consumed.has(i));
	player.hand.push(...keep, ...megas);
	player.pendingMega = [];
	player.megaGroups = {};
	return megas.length > 0 ? { mega: megas.length } : {};
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
	const counting = remaining.reduce(
		(sum, c) => sum + (c.t === "research" || c.t === "microbiotics" ? 0 : c.m ? 4 : 1),
		0
	);
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
	const forKicker = move.kicker === true;
	const pool: (Upgrade | Kicker)[] = forKicker ? state.kickerMarket : state.market;
	if (!Number.isInteger(marketIndex) || marketIndex < 0 || marketIndex >= pool.length) {
		err("invalid market index");
	}
	const card = pool[marketIndex] as Upgrade | Kicker;
	const kicker = forKicker ? (card as Kicker) : undefined;
	const upgrade = forKicker ? undefined : (card as Upgrade);
	const price = kicker ? KICKER_SPECS[kicker].price : UPGRADE_SPECS[upgrade as Upgrade].price;
	// A stripped fastBid log masks the auctioneer's sealed opening bid as -1;
	// replay skips the floor check (the server validated it live).
	if (!replayMode && (!Number.isInteger(bid) || bid < price)) {
		err(`opening bid must be at least ${price}`);
	}
	// Kicker cards have no discounts; upgrades use the buyer's discount.
	const discount = upgrade ? upgradeDiscount(player, upgrade) : 0;
	if (!replayMode && handValue(player) < Math.max(0, bid - discount)) {
		err(`cannot afford a bid of ${bid} (needs ${Math.max(0, bid - discount)}, holds ${handValue(player)})`);
	}
	state.phase = "auction";
	state.auction = {
		marketIndex,
		// Exactly one of upgrade/kicker is set; omitting the other keeps the
		// state JSON-round-trippable (JSON drops undefined-valued keys).
		...(upgrade !== undefined ? { upgrade } : {}),
		...(kicker !== undefined ? { kicker } : {}),
		auctioneer: seat,
		highBid: bid,
		highBidder: seat,
		passed: [],
		activeBidder: seat,
	};
	const info: MoveInfo = kicker ? { kicker } : { upgrade: upgrade as Upgrade };
	if (isFastBid(state)) {
		// Sealed-bid auction: everyone bids at once, the auctioneer's opening
		// bid is their sealed bid. Passing is itself a private bid of 0, so a
		// weak hand is normally not revealed by skipping the player — but a seat
		// whose PUBLIC max bid cannot even reach the list price is auto-passed:
		// that bound uses only public card types, so it leaks nothing and simply
		// skips bids the auction would never wait on.
		state.auction.bids = { [seat]: bid };
		const autoPassed = fastAutoPass(state, state.auction);
		// Auto-passing may leave the auctioneer as the only bidder: resolve now.
		const resolved = fastBidMaybeResolve(state, state.auction);
		const out: MoveInfo = { ...info, ...resolved };
		return autoPassed.length > 0 ? { ...out, autoPassed } : out;
	}
	const autoPassed: number[] = [];
	advanceBidder(state, autoPassed);
	return autoPassed.length > 0 ? { ...info, autoPassed } : info;
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

/** The log info identifying the card under auction (a colony upgrade or a Kicker card). */
function auctionInfo(auction: NonNullable<GameState["auction"]>): MoveInfo {
	return auction.kicker ? { kicker: auction.kicker } : { upgrade: auction.upgrade };
}

/** Kicker-aware affordability check for a bid on the card under auction. */
function assertCanPayBidFor(player: PlayerState, auction: NonNullable<GameState["auction"]>, bid: number): void {
	if (replayMode) {
		return;
	}
	const discount = auction.upgrade ? upgradeDiscount(player, auction.upgrade) : 0;
	const due = Math.max(0, bid - discount);
	if (handValue(player) < due) {
		err(`cannot afford a bid of ${bid} (needs ${due}, holds ${handValue(player)})`);
	}
}

/** List price of the card under auction. */
function auctionPrice(auction: NonNullable<GameState["auction"]>): number {
	return auction.kicker ? KICKER_SPECS[auction.kicker].price : UPGRADE_SPECS[auction.upgrade as Upgrade].price;
}

/** The winner's discount on the card under auction (Kicker cards have none). */
function auctionDue(state: GameState, auction: NonNullable<GameState["auction"]>, player: PlayerState): number {
	const discount = auction.upgrade ? upgradeDiscount(player, auction.upgrade) : 0;
	return Math.max(0, auction.highBid - discount);
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

function advanceBidder(state: GameState, autoPassed?: number[]): void {
	const auction = state.auction;
	if (!auction) {
		err("no auction in progress");
	}
	const order = biddingOrder(state);
	const from = order.indexOf(auction.activeBidder);
	for (let step = 1; step <= order.length; step++) {
		const seat = order[(from + step) % order.length] as number;
		if (seat === auction.highBidder) {
			// Auction over: everyone else passed. Auto-pass can produce this even
			// on the opening advance (nobody can beat the opening bid).
			state.phase = "auctionPayment";
			auction.activeBidder = seat;
			return;
		}
		const p = state.players[seat];
		if (p && !p.dropped && !auction.passed.includes(seat)) {
			// Auto-pass a bidder who can't beat the high bid (public bound, or true
			// hand value when they opted into autoPassBids). The seats are recorded
			// in the move's info so replay reproduces them verbatim — the true-value
			// check cannot be recomputed from a stripped log.
			const autoPass = replayMode ? replayAutoPassed.includes(seat) : mustAutoPassBid(state, seat);
			if (autoPass) {
				auction.passed.push(seat);
				autoPassed?.push(seat);
				continue;
			}
			auction.activeBidder = seat;
			return;
		}
	}
	// Looping without hitting the high bidder means everyone else was skipped
	// (dropped or auto-passed on an earlier advance); the high bidder wins.
	state.phase = "auctionPayment";
	auction.activeBidder = auction.highBidder;
}

function moveBid(state: GameState, move: Move & { action: "bid" }, seat: number, player: PlayerState): MoveInfo {
	const auction = state.auction;
	if (state.phase !== "auction" || !auction) {
		err("not this player's turn to bid");
	}
	if (auction.bids) {
		return moveFastBid(state, move, seat, player, auction);
	}
	if (auction.activeBidder !== seat) {
		err("not this player's turn to bid");
	}
	if (!Number.isInteger(move.amount) || move.amount <= auction.highBid) {
		err(`bid must be higher than ${auction.highBid}`);
	}
	assertCanPayBidFor(player, auction, move.amount);
	auction.highBid = move.amount;
	auction.highBidder = seat;
	const autoPassed: number[] = [];
	advanceBidder(state, autoPassed);
	const info = auctionInfo(auction);
	return autoPassed.length > 0 ? { ...info, autoPassed } : info;
}

function moveBidPass(state: GameState, _move: Move & { action: "bidPass" }, seat: number): MoveInfo {
	const auction = state.auction;
	if (state.phase !== "auction" || !auction) {
		err("not this player's turn to bid");
	}
	if (auction.bids) {
		return moveFastBidPass(state, seat, auction);
	}
	if (auction.activeBidder !== seat) {
		err("not this player's turn to bid");
	}
	auction.passed.push(seat);
	const autoPassed: number[] = [];
	advanceBidder(state, autoPassed);
	const info = auctionInfo(auction);
	return autoPassed.length > 0 ? { ...info, autoPassed } : info;
}

/**
 * Auto-pass the seats that provably cannot reach a fast auction's list price:
 * their public max bid (each card worth its deck max — public information) is
 * below the price floor. This leaks nothing (the bound is computable from the
 * public card types) and skips bids the auction would never wait on. Returns
 * the seats passed; replay applies the recorded seats verbatim.
 */
function fastAutoPass(state: GameState, auction: NonNullable<GameState["auction"]>): number[] {
	const bids = auction.bids;
	if (!bids) {
		return [];
	}
	const price = auctionPrice(auction);
	const seats = replayMode
		? replayAutoPassed
		: state.players.flatMap((p, seat) =>
				!p.dropped && bids[seat] === undefined && publicMaxBid(state, seat, auction.upgrade) < price ? [seat] : []
			);
	for (const seat of seats) {
		bids[seat] = 0;
	}
	return seats;
}

/** Seats still expected to bid in a fast auction (everyone active who hasn't). */
export function fastBidPending(state: GameState): number[] {
	const auction = state.auction;
	if (!auction?.bids) {
		return [];
	}
	return state.players.flatMap((p, seat) => (!p.dropped && auction.bids?.[seat] === undefined ? [seat] : []));
}

function moveFastBid(
	state: GameState,
	move: Move & { action: "bid" },
	seat: number,
	player: PlayerState,
	auction: NonNullable<GameState["auction"]>
): MoveInfo {
	const bids = auction.bids;
	if (!bids) {
		err("not a sealed-bid auction");
	}
	if (bids[seat] !== undefined) {
		err("this player has already bid");
	}
	// A stripped log masks other players' sealed bids as -1; replay stores the
	// placeholder (the resolution comes from the recorded MoveInfo) and skips
	// validation, which the server already did live.
	if (!replayMode) {
		if (!Number.isInteger(move.amount) || move.amount < auctionPrice(auction)) {
			err(`bid must be at least ${auctionPrice(auction)}`);
		}
		assertCanPayBidFor(player, auction, move.amount);
	}
	bids[seat] = move.amount;
	return fastBidMaybeResolve(state, auction);
}

function moveFastBidPass(state: GameState, seat: number, auction: NonNullable<GameState["auction"]>): MoveInfo {
	const bids = auction.bids;
	if (!bids || bids[seat] !== undefined) {
		err("not this player's turn to bid");
	}
	bids[seat] = 0;
	return fastBidMaybeResolve(state, auction);
}

/** Resolve the auction once every active seat has a sealed bid in. */
function fastBidMaybeResolve(state: GameState, auction: NonNullable<GameState["auction"]>): MoveInfo {
	if (fastBidPending(state).length > 0) {
		return auctionInfo(auction);
	}
	const bids = auction.bids ?? {};
	let winningBid = 0;
	let secondBid = 0;
	for (const amount of Object.values(bids)) {
		if (amount > winningBid) {
			secondBid = winningBid;
			winningBid = amount;
		} else if (amount > secondBid) {
			secondBid = amount;
		}
	}
	// The winner is the highest bidder; ties go to the seat earliest in bidding
	// order (purchase order starting from the auctioneer).
	let winner: number;
	if (replayMode && replayFastResolve) {
		// A stripped log hides the other sealed bids, so the resolution cannot
		// be recomputed: apply the recorded outcome verbatim.
		winningBid = replayFastResolve.winningBid;
		secondBid = replayFastResolve.secondBid;
		winner = replayFastResolve.winner;
	} else {
		const tied = biddingOrder(state).filter((seat) => bids[seat] === winningBid && !state.players[seat]?.dropped);
		winner = tied[0] ?? auction.auctioneer;
	}
	// Second-price sealed auction: the winner pays the runner-up bid + 1, but
	// never below the list price (the reserve — when everyone else passes, the
	// list price is the effective second price) and never above their own bid.
	const price = Math.min(winningBid, Math.max(auctionPrice(auction), secondBid + 1));
	auction.highBid = price;
	auction.highBidder = winner;
	auction.activeBidder = winner;
	state.phase = "auctionPayment";
	return { ...auctionInfo(auction), winningBid, secondBid, winner };
}

function movePay(state: GameState, move: Move & { action: "pay" }, seat: number, player: PlayerState): MoveInfo {
	const auction = state.auction;
	if (state.phase !== "auctionPayment" || !auction || auction.highBidder !== seat) {
		err("no payment expected from this player");
	}
	const due = auctionDue(state, auction, player);
	const indices = sanitizeIndices(move.cards, player.hand.length, "pay");
	const paid = spendCards(state, player, indices, due);

	let name: string;
	let info: MoveInfo;
	if (auction.kicker) {
		const kicker = auction.kicker;
		const spec = KICKER_SPECS[kicker];
		state.kickerMarket.splice(auction.marketIndex, 1);
		player.kickers[kicker] += 1;
		if (spec.freeRobot) {
			player.robots += 1;
		}
		if (spec.freeFactory) {
			player.factories.push({ type: spec.freeFactory, manned: false });
		}
		name = spec.name;
		info = { kicker, paid };
	} else {
		const upgrade = auction.upgrade as Upgrade;
		state.market.splice(auction.marketIndex, 1);
		player.upgrades[upgrade] += 1;
		const freeFactory = UPGRADE_SPECS[upgrade].freeFactory;
		if (freeFactory) {
			player.factories.push({ type: freeFactory, manned: false });
		}
		name = UPGRADE_SPECS[upgrade].name;
		info = { upgrade, paid };
	}

	state.messages.push(`${player.name} won ${name} for ${auction.highBid}`);
	state.phase = "actions";
	state.activeSeat = auction.auctioneer;
	state.auction = null;

	const auctioneer = state.players[state.activeSeat];
	if (!auctioneer || auctioneer.dropped || auctioneer.done) {
		startActions(state);
	}
	return info;
}

function requireExchangeTurn(state: GameState, seat: number): NonNullable<GameState["exchange"]> {
	const exchange = state.exchange;
	if (state.phase !== "exchange" || !exchange) {
		err("not in the exchange step");
	}
	if (exchange.seat !== seat) {
		err("not this player's exchange turn");
	}
	return exchange;
}

/**
 * Wily Trader / Merchant House: hand one of your own non-Mega cards to a
 * target who holds a non-Mega card of the same type. The target must hand
 * back a higher-valued card of that type if they have one (the lowest such,
 * the obvious choice for them), otherwise they return the given card. A card
 * taken this way is parked face-down on the Wily Trader / Merchant House
 * until the phase ends, so it cannot be taken again this phase.
 */
function moveExchange(
	state: GameState,
	move: Move & { action: "exchange" },
	seat: number,
	player: PlayerState
): MoveInfo {
	const exchange = requireExchangeTurn(state, seat);
	const tradable = exchangeResources(player);
	if (!Number.isInteger(move.card) || move.card < 0 || move.card >= player.hand.length) {
		err("invalid card index");
	}
	const given = player.hand[move.card] as ProductionCard;
	if (given.m || !tradable.includes(given.t)) {
		err(`cannot offer a ${given.m ? "mega " : ""}${given.t} card in an exchange`);
	}
	if (!Number.isInteger(move.target) || move.target === seat) {
		err("invalid target");
	}
	const target = getPlayer(state, move.target);
	// The target must hold a non-Mega card of the offered type.
	const candidates: number[] = [];
	target.hand.forEach((c, i) => {
		if (!c.m && c.t === given.t) {
			candidates.push(i);
		}
	});
	if (candidates.length === 0) {
		err(`${target.name} has no ${given.t} card to exchange`);
	}

	// Resolve the target's return: the lowest higher-valued card of the type,
	// or the given card back when nothing is higher. Replay applies the
	// recorded index verbatim (the target's values are hidden in a stripped
	// log, so the choice cannot be recomputed).
	let takeIndex = -1;
	if (replayMode) {
		takeIndex = replayExchangeTake;
		if (
			takeIndex >= 0 &&
			(takeIndex >= target.hand.length || (target.hand[takeIndex] as ProductionCard).t !== given.t)
		) {
			err("recorded exchange does not match the target's hand");
		}
	} else {
		let best = -1;
		for (const i of candidates) {
			const v = (target.hand[i] as ProductionCard).v;
			if (v > given.v && (best === -1 || v < (target.hand[best] as ProductionCard).v)) {
				best = i;
			}
		}
		takeIndex = best;
	}

	// Everything validated; now mutate. The given card leaves the giver's hand.
	player.hand.splice(move.card, 1);
	let taken: ProductionCard;
	if (takeIndex >= 0) {
		taken = target.hand.splice(takeIndex, 1)[0] as ProductionCard;
	} else {
		// No higher card: the target returns the given card.
		taken = given;
	}
	// The giver's taken card is parked on the Wily Trader / Merchant House
	// until the phase ends; the target keeps the given card (unless it bounced).
	if (taken !== given) {
		target.hand.push(given);
	}
	exchange.parked.push({ seat, card: taken });
	state.messages.push(
		taken === given
			? `${player.name} offered a ${given.t} card to ${target.name}, who had nothing higher`
			: `${player.name} trades a ${given.t} card to ${target.name} for a higher one`
	);
	advanceExchange(state);
	return { exchangeTake: takeIndex, exchangeValue: taken.v };
}

function moveExchangePass(state: GameState, seat: number): MoveInfo {
	requireExchangeTurn(state, seat);
	advanceExchange(state);
	return {};
}

/** Apply one purchase step of a turn. Validates against the current state and mutates it; returns the amount paid. */
export function applyTurnBuy(state: GameState, player: PlayerState, buy: TurnBuy): number {
	switch (buy.buy) {
		case "factory": {
			const spec = FACTORIES[buy.factory];
			if (!canBuyFactory(player, buy.factory)) {
				err(`cannot build ${buy.factory} factories`);
			}
			const indices = sanitizeIndices(buy.cards, player.hand.length, "buy factory");
			if (spec.needsResearchCard && !indices.some((i) => player.hand[i]?.t === "research")) {
				err("buying a New Chemicals factory requires spending a research card");
			}
			const paid = spendCards(state, player, indices, spec.cost);
			player.factories.push({ type: buy.factory, manned: false });
			return paid;
		}
		case "population": {
			if (!Number.isInteger(buy.count) || buy.count < 1) {
				err("invalid population count");
			}
			if (player.population + buy.count > populationMax(player)) {
				err(`population limit is ${populationMax(player)}`);
			}
			const indices = sanitizeIndices(buy.cards, player.hand.length, "buy population");
			const paid = spendCards(state, player, indices, populationCost(player) * buy.count);
			player.population += buy.count;
			return paid;
		}
		case "robots": {
			if (player.upgrades.robots === 0) {
				err("requires the Robots upgrade");
			}
			if (!Number.isInteger(buy.count) || buy.count < 1) {
				err("invalid robot count");
			}
			if (player.robots + buy.count > robotMax(player)) {
				err(`robot limit is ${robotMax(player)}`);
			}
			const indices = sanitizeIndices(buy.cards, player.hand.length, "buy robots");
			const paid = spendCards(state, player, indices, ROBOT_COST * buy.count);
			player.robots += buy.count;
			return paid;
		}
	}
}

function moveEndTurn(
	state: GameState,
	move: Move & { action: "endTurn" },
	seat: number,
	player: PlayerState
): MoveInfo {
	requireActionTurn(state, seat, player);
	// A multi-step move must reject without mutating anything: dry-run the whole
	// turn on a clone first (the state is JSON-serializable by invariant, and no
	// step draws randomness, so the second run is identical).
	runTurn(JSON.parse(JSON.stringify(state)) as GameState, seat, move);
	return runTurn(state, seat, move);
}

function runTurn(state: GameState, seat: number, move: Move & { action: "endTurn" }): MoveInfo {
	const player = state.players[seat] as PlayerState;
	let paid = 0;
	for (const buy of move.buys) {
		paid += applyTurnBuy(state, player, buy);
	}
	const manned = sanitizeIndices(move.manned, player.factories.length, "endTurn");
	if (manned.length > player.population + player.robots) {
		err(`only ${player.population + player.robots} operators available`);
	}
	player.factories.forEach((factory, i) => {
		factory.manned = manned.includes(i);
	});
	player.done = true;
	return move.buys.length > 0 ? { paid } : {};
}

export function dropPlayer(state: GameState, seat: number): GameState {
	const player = state.players[seat];
	if (!player || player.dropped) {
		return state;
	}
	player.dropped = true;
	player.mustDiscard = false;
	player.done = true;
	player.pendingMega = [];
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

	if (state.phase === "mega" && !state.players.some((p) => (p.pendingMega?.length ?? 0) > 0)) {
		enterDiscardPhase(state);
		return state;
	}

	const auction = state.auction;
	if (auction && (state.phase === "auction" || state.phase === "auctionPayment")) {
		if (state.phase === "auction" && auction.bids) {
			// Fast auction: a pending bidder dropping passes (sealed bid of 0);
			// a dropped winner simply isn't in the bidding order at resolution.
			if (auction.bids[seat] === undefined) {
				auction.bids[seat] = 0;
				fastBidMaybeResolve(state, auction);
			}
			return state;
		}
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
		enterExchangePhase(state);
		return state;
	}
	if (state.phase === "exchange" && state.exchange) {
		if (state.exchange.seat === seat) {
			// The seat due to exchange is gone: skip them (their parked cards
			// were returned to their hand by advanceExchange, which then skips
			// dropped seats via hasExchange).
			advanceExchange(state);
		}
		return state;
	}
	if (state.phase === "actions" && state.activeSeat === seat) {
		startActions(state);
	}
	return state;
}
