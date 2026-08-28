import { FACTORIES, KICKER_SPECS, MEGA_CARDS, ROBOT_COST, UPGRADE_SPECS, VICTORY_VP } from "./data.js";
import { refillKickers, refillMarket } from "./market.js";
import { producePlayer } from "./production.js";
import {
	canBuyFactory,
	computePurchaseOrder,
	countingHandSize,
	handCapacity,
	handValue,
	megaEligible,
	mustAutoPassBid,
	populationCost,
	populationMax,
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
	refillMarket(state);
	refillKickers(state);

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
		kickerMarket: [...state.kickerMarket],
		produced,
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
		startActions(state);
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
	const pending = player.pendingMega ?? [];
	const indices = sanitizeIndices(move.cards, pending.length, "mega");
	// Group the selected draws by resource: each must form full groups of 4 of a
	// mega resource with enough pool copies left.
	const byResource = new Map<Resource, number>();
	for (const i of indices) {
		const resource = (pending[i] as ProductionCard).t;
		byResource.set(resource, (byResource.get(resource) ?? 0) + 1);
	}
	const picked = new Set(indices);
	const keep: ProductionCard[] = [];
	const megas: ProductionCard[] = [];
	for (const [resource, count] of byResource) {
		const mega = MEGA_CARDS[resource];
		if (!mega || count % 4 !== 0) {
			err(`mega conversion needs groups of exactly 4 draws of the same mega resource (got ${count} of ${resource})`);
		}
		const groups = count / 4;
		if ((state.megaSupply[resource] ?? 0) < groups) {
			err(`not enough mega ${resource} cards left in the pool`);
		}
		for (let g = 0; g < groups; g++) {
			megas.push({ t: resource, v: mega.value, m: true });
		}
	}
	// Everything validated; now mutate.
	for (const [resource, count] of byResource) {
		state.megaSupply[resource] = (state.megaSupply[resource] ?? 0) - count / 4;
	}
	pending.forEach((card, i) => {
		if (!picked.has(i)) {
			keep.push(card);
		}
	});
	player.hand.push(...keep, ...megas);
	player.pendingMega = [];
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
	if (!Number.isInteger(bid) || bid < price) {
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
		upgrade,
		kicker,
		auctioneer: seat,
		highBid: bid,
		highBidder: seat,
		passed: [],
		activeBidder: seat,
	};
	const info: MoveInfo = kicker ? { kicker } : { upgrade: upgrade as Upgrade };
	if (isFastBid(state)) {
		// Sealed-bid auction: everyone bids at once, the auctioneer's opening
		// bid is their sealed bid. No auto-pass — passing is itself a private
		// bid of 0, so a weak hand is not revealed by skipping the player.
		state.auction.bids = { [seat]: bid };
		return info;
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
	// Price: runner-up bid + 1, but never more than the winner's own bid (the
	// "no more money" case). A sole bidder pays the list price (secondBid = 0).
	const price = secondBid === 0 ? winningBid : Math.min(secondBid + 1, winningBid);
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
		startActions(state);
		return state;
	}
	if (state.phase === "actions" && state.activeSeat === seat) {
		startActions(state);
	}
	return state;
}
