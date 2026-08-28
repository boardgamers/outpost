import {
	FACTORIES,
	KICKER_SPECS,
	MAX_CARD_VALUE,
	MIN_CARD_VALUE,
	PRODUCTION_DECKS,
	UPGRADE_SPECS,
	applyMove,
	applyTurnBuy,
	auctionCard,
	bestPayment,
	canBuyFactory,
	countingHandSize,
	describeLog,
	describeLogEntry,
	exchangeResources,
	handCapacity,
	handValue,
	megaEligible as megaEligibleEngine,
	populationCost,
	populationMax,
	rankings,
	replay as replayEngine,
	robotMax,
	scores,
	upgradeDiscount,
	victoryPoints,
	type FactoryType,
	type GameState,
	type Kicker,
	type Move,
	type PlayerState,
	type TurnBuy,
	type Upgrade,
} from "outpost-engine";
import type { ViewerBridge } from "./bgs.svelte";

export interface ReplayState {
	active: boolean;
	current: number;
	end: number;
	state: GameState | null;
}

export type PendingKind =
	| { kind: "factory"; factory: FactoryType; cost: number }
	| { kind: "population"; count: number; cost: number }
	| { kind: "robots"; count: number; cost: number };

export const PLAYER_COLORS = [
	"#4f8ef7",
	"#f0716a",
	"#57c17b",
	"#f2b84b",
	"#b07fe8",
	"#4fd1c5",
	"#f28ec0",
	"#a3d65c",
	"#f79a4f",
	"#8b94f7",
] as const;

export function playerColor(index: number): string {
	return PLAYER_COLORS[index % PLAYER_COLORS.length] as string;
}

export const RESOURCE_LABELS: Record<string, string> = {
	ore: "Ore",
	water: "Water",
	titanium: "Titanium",
	research: "Research",
	microbiotics: "Microbiotics",
	newChemicals: "New Chemicals",
	orbitalMedicine: "Orbital Medicine",
	ringOre: "Ring Ore",
	moonOre: "Moon Ore",
};

function cardRange(resource: keyof typeof MIN_CARD_VALUE): string {
	return `${MIN_CARD_VALUE[resource]}–${MAX_CARD_VALUE[resource]}`;
}

export const UPGRADE_EFFECTS: Record<Upgrade, string> = {
	dataLibrary: "−10 on Scientists and Laboratory bids (per copy).",
	warehouse: "+3 hand capacity (per copy).",
	heavyEquipment: `Allows titanium factories (${cardRange("titanium")} cards). −5 on Warehouse/Nodule, −15 on Outpost (per copy).`,
	nodule: "+3 population limit (per copy).",
	scientists: `Produces a Research card (${cardRange("research")}) each round (per copy).`,
	orbitalLab: `Produces a Microbiotics card (${cardRange("microbiotics")}) each round (per copy).`,
	robots: "Allows buying robots, operators that ignore the population limit (per copy: up to population).",
	laboratory: `Allows research factories (${cardRange("research")} cards); comes with a free one.`,
	ecoplants: "Colonists cost 5 instead of 10. −10 on Outpost bids (per copy).",
	outpost: "Free titanium factory, +5 hand capacity, +5 population limit.",
	spaceStation: `Produces an Orbital Medicine card (${cardRange("orbitalMedicine")}) each round.`,
	planetaryCruiser: `Produces a Ring Ore card (${cardRange("ringOre")}) each round.`,
	moonBase: `Produces a Moon Ore card (${cardRange("moonOre")}) each round.`,
};

export const KICKER_EFFECTS: Record<Kicker, string> = {
	iceProspector:
		"When you draw Water cards in production, draw 1 extra Water card, then discard 1 of the Water cards just drawn.",
	robotPrototype:
		"Comes with a free robot you can operate even without a Robots upgrade (counts against your robot limit once you own one).",
	smelter: "−5 on Robots upgrade bids. Draw 1 extra Ore card per 2 ore factories you operate.",
	wilyTrader:
		"Once per round, trade an Ore/Water/Titanium card to another player for their higher-valued card of the same type.",
	launchFacility: "−30 on Space Station, Planetary Cruiser, and Moon Base bids.",
	merchantHouse: "Like Wily Trader, but for Research, Microbiotics, and New Chemicals cards.",
	ncfPrototype: "Comes with a free New Chemicals factory (no research card needed).",
	refinery:
		"When you draw Titanium cards in production, draw 1 extra Titanium card, then discard 1 of the Titanium cards just drawn.",
	biosphere: "+5 colony support (population) limit.",
};

export class ViewerStore {
	liveState = $state<GameState | null>(null);
	replay = $state<ReplayState>({ active: false, current: 0, end: 0, state: null });
	playerIndex = $state<number | undefined>(undefined);
	avatars = $state<string[]>([]);
	preferences = $state<Record<string, unknown>>({});
	logLines = $state<string[]>([]);
	seenLog = $state(0);
	lastMoveAt = $state<number>(0);

	cardPick = $state<number[]>([]);
	/** Indices into me.pendingMega selected for mega conversion (groups of 4). */
	megaPick = $state<number[]>([]);
	pending = $state<PendingKind | null>(null);
	auctionPick = $state<{ marketIndex: number; bid: number; kicker?: boolean } | null>(null);
	bidAmount = $state(0);
	manning = $state(false);
	manningPick = $state<number[]>([]);
	/** Wily Trader / Merchant House: the hand card offered and the target seat. */
	exchangeCard = $state<number | null>(null);
	exchangeTarget = $state<number | null>(null);
	/** One auto card-suggestion per context (payment due, discard); reset by cancel(). */
	autoSuggested = $state(false);

	// Purchases staged this turn. They are only sent to the server as part of
	// the endTurn move (the whole turn is one move); until then `draft` holds
	// the live state with the staged buys applied, and it is what the UI shows.
	turnBuys = $state<TurnBuy[]>([]);
	private draft = $state<GameState | null>(null);

	constructor(private bridge: ViewerBridge) {
		bridge.on("state", (state) => this.setState(state));
		bridge.on("player", ({ index }) => {
			this.playerIndex = typeof index === "number" && index >= 0 ? index : undefined;
		});
		bridge.on("avatars", (list) => (this.avatars = list ?? []));
		bridge.on("preferences", (prefs) => (this.preferences = prefs ?? {}));
		bridge.on("state:updated", () => bridge.fetchState());
		bridge.on("gamelog", (payload) => this.onGamelog(payload));
		bridge.on("replay:start", () => this.startReplay());
		bridge.on("replay:to", (to) => this.replayTo(to));
		bridge.on("replay:end", () => this.endReplay());
	}

	get state(): GameState | null {
		if (this.replay.active) {
			return this.replay.state;
		}
		return this.draft ?? this.liveState;
	}

	private setState(state: GameState): void {
		this.liveState = state;
		this.seenLog = state.log.length;
		this.logLines = describeLog(state);
		if (!this.replay.active) {
			this.cancel();
			this.lastMoveAt = Date.now();
		}
		this.rebuildDraft();
		this.bridge.replaceLog(this.logLines);
	}

	// Re-apply the staged buys on top of the (new) live state; drop them when
	// they no longer apply (turn is over, or the server state moved on).
	private rebuildDraft(): void {
		if (this.turnBuys.length === 0) {
			this.draft = null;
			return;
		}
		const s = this.liveState;
		if (!s || s.ended || this.playerIndex === undefined || s.phase !== "actions" || s.activeSeat !== this.playerIndex) {
			this.turnBuys = [];
			this.draft = null;
			return;
		}
		try {
			const clone = JSON.parse(JSON.stringify(s)) as GameState;
			const player = clone.players[this.playerIndex] as PlayerState;
			for (const buy of this.turnBuys) {
				applyTurnBuy(clone, player, buy);
			}
			this.draft = clone;
		} catch {
			this.turnBuys = [];
			this.draft = null;
		}
	}

	private onGamelog(payload: { start: number; end?: number; data: unknown }): void {
		const data = payload?.data as { log?: unknown[] } | undefined;
		const entries = Array.isArray(data?.log) ? (data.log as GameState["log"]) : [];
		const base = this.liveState;
		if (!base || entries.length === 0) {
			this.bridge.fetchState();
			return;
		}
		if (payload.start >= this.logLines.length) {
			const appended = entries.map((entry) => describeLogEntry(base, entry));
			this.logLines = [...this.logLines, ...appended];
			this.seenLog = base.log.length;
			this.bridge.replaceLog(this.logLines);
		} else {
			this.bridge.fetchState();
		}
	}

	private startReplay(): void {
		const live = this.liveState;
		if (!live) {
			return;
		}
		this.replay = { active: true, current: 1, end: live.log.length, state: replayEngine(live, { to: 1 }) };
		this.bridge.replayInfo({ start: 1, current: 1, end: live.log.length });
	}

	private replayTo(to: number): void {
		const live = this.liveState;
		if (!live || !this.replay.active) {
			return;
		}
		const clamped = Math.max(1, Math.min(to, live.log.length));
		this.replay = { ...this.replay, current: clamped, state: replayEngine(live, { to: clamped }) };
		this.bridge.replayInfo({ start: 1, current: clamped, end: this.replay.end });
	}

	replayToEntry(to: number): void {
		this.replayTo(to);
	}

	private endReplay(): void {
		this.replay = { active: false, current: 0, end: 0, state: null };
	}

	get me(): PlayerState | null {
		const s = this.draft ?? this.liveState;
		return s && this.playerIndex !== undefined ? (s.players[this.playerIndex] ?? null) : null;
	}

	get spectator(): boolean {
		return this.playerIndex === undefined;
	}

	get iMustDiscard(): boolean {
		const s = this.liveState;
		return !!s && !s.ended && s.phase === "discard" && !this.replay.active && (this.me?.mustDiscard ?? false);
	}

	/** Mega phase: I have staged production draws awaiting the mega-vs-singles choice. */
	get myMega(): boolean {
		const s = this.liveState;
		return !!s && !s.ended && s.phase === "mega" && !this.replay.active && (this.me?.pendingMega?.length ?? 0) > 0;
	}

	/** Mega conversions available from my staged draws (resource -> groups of 4). */
	get megaEligible(): Partial<Record<string, number>> {
		const s = this.liveState;
		const me = this.me;
		if (!s || !me) {
			return {};
		}
		return megaEligibleEngine(s, me);
	}

	get myActionTurn(): boolean {
		const s = this.liveState;
		return (
			!!s &&
			!s.ended &&
			s.phase === "actions" &&
			!this.replay.active &&
			this.playerIndex !== undefined &&
			s.activeSeat === this.playerIndex &&
			!(this.me?.done ?? true)
		);
	}

	get myBidTurn(): boolean {
		const s = this.liveState;
		if (!s || s.ended || s.phase !== "auction" || this.replay.active || this.playerIndex === undefined) {
			return false;
		}
		// fastBid: I owe a sealed bid while mine isn't in yet.
		if (s.auction?.bids) {
			return s.auction.bids[this.playerIndex] === undefined;
		}
		return s.auction?.activeBidder === this.playerIndex;
	}

	/** fastBid: everyone bids at once with sealed bids. */
	get fastBid(): boolean {
		return !!this.liveState?.auction?.bids;
	}

	/** Seats still expected to bid in a fast auction. */
	get fastBidPending(): number[] {
		const s = this.liveState;
		if (!s?.auction?.bids) {
			return [];
		}
		return s.players.flatMap((p, seat) => (!p.dropped && s.auction?.bids?.[seat] === undefined ? [seat] : []));
	}

	get myPayment(): boolean {
		const s = this.liveState;
		return (
			!!s &&
			!s.ended &&
			s.phase === "auctionPayment" &&
			!this.replay.active &&
			s.auction?.highBidder === this.playerIndex
		);
	}

	/** Wily Trader / Merchant House: it is my exchange action this phase. */
	get myExchange(): boolean {
		const s = this.liveState;
		return (
			!!s &&
			!s.ended &&
			s.phase === "exchange" &&
			!this.replay.active &&
			this.playerIndex !== undefined &&
			s.exchange?.seat === this.playerIndex
		);
	}

	/** Resource types I may offer, from the Wily Trader / Merchant House I own. */
	get exchangeOfferTypes(): string[] {
		const me = this.me;
		return me ? exchangeResources(me) : [];
	}

	/** Whether a hand card of mine can be offered in the exchange (non-Mega, tradable type). */
	canOfferInExchange(index: number): boolean {
		const me = this.me;
		const card = me?.hand[index];
		return !!card && !card.m && this.exchangeOfferTypes.includes(card.t);
	}

	/**
	 * Seats I can target with the currently picked card: any other active
	 * player holding a non-Mega card of the same type (their card values are
	 * hidden, but types are public knowledge).
	 */
	get exchangeTargets(): number[] {
		const s = this.liveState;
		const me = this.me;
		if (!s || !me || this.exchangeCard === null || this.playerIndex === undefined) {
			return [];
		}
		const type = me.hand[this.exchangeCard]?.t;
		if (type === undefined) {
			return [];
		}
		return s.players.flatMap((p, seat) =>
			seat !== this.playerIndex && !p.dropped && p.hand.some((c) => !c.m && c.t === type) ? [seat] : []
		);
	}

	pickExchangeCard(index: number): void {
		if (!this.myExchange || !this.canOfferInExchange(index)) {
			return;
		}
		this.exchangeCard = this.exchangeCard === index ? null : index;
		this.exchangeTarget = null;
	}

	pickExchangeTarget(seat: number): void {
		if (!this.myExchange || !this.exchangeTargets.includes(seat)) {
			return;
		}
		this.exchangeTarget = this.exchangeTarget === seat ? null : seat;
	}

	confirmExchange(): void {
		if (!this.myExchange || this.exchangeCard === null || this.exchangeTarget === null) {
			return;
		}
		if (!this.exchangeTargets.includes(this.exchangeTarget)) {
			return;
		}
		this.send({ action: "exchange", card: this.exchangeCard, target: this.exchangeTarget });
	}

	passExchange(): void {
		if (this.myExchange) {
			this.send({ action: "exchangePass" });
		}
	}

	get myPaymentDue(): number {
		return this.myPayment ? this.auctionDue() : 0;
	}

	get interactive(): boolean {
		return this.iMustDiscard || this.myMega || this.myActionTurn || this.myBidTurn || this.myPayment || this.myExchange;
	}

	get discardExcess(): number {
		const me = this.me;
		return me ? Math.max(0, countingHandSize(me) - handCapacity(me)) : 0;
	}

	get popCost(): number {
		const me = this.me;
		return me ? populationCost(me) : 0;
	}

	get maxBid(): number {
		const me = this.me;
		const auction = this.liveState?.auction;
		if (!me || !auction) {
			return 0;
		}
		return handValue(me) + (auction.upgrade ? upgradeDiscount(me, auction.upgrade) : 0);
	}

	get finalRankings(): number[] {
		const s = this.liveState;
		return s && s.ended ? rankings(s) : [];
	}

	get finalScores(): number[] {
		const s = this.liveState;
		return s ? scores(s) : [];
	}

	get myHandValue(): number {
		const me = this.me;
		return me ? handValue(me) : 0;
	}

	vpOf(index: number): number {
		const p = this.state?.players[index];
		return p ? victoryPoints(p) : 0;
	}

	handCapOf(index: number): number {
		const p = this.state?.players[index];
		return p ? handCapacity(p) : 0;
	}

	countingOf(index: number): number {
		const p = this.state?.players[index];
		return p ? countingHandSize(p) : 0;
	}

	popMaxOf(index: number): number {
		const p = this.state?.players[index];
		return p ? populationMax(p) : 0;
	}

	robotMaxOf(index: number): number {
		const p = this.state?.players[index];
		return p ? robotMax(p) : 0;
	}

	discountOf(index: number, upgrade: Upgrade): number {
		const p = this.state?.players[index];
		return p ? upgradeDiscount(p, upgrade) : 0;
	}

	auctionDue(): number {
		const me = this.me;
		const auction = this.liveState?.auction;
		if (!me || !auction) {
			return 0;
		}
		return Math.max(0, auction.highBid - (auction.upgrade ? upgradeDiscount(me, auction.upgrade) : 0));
	}

	pickTotal(): number {
		const me = this.me;
		if (!me) {
			return 0;
		}
		return this.cardPick.reduce((sum, i) => sum + (me.hand[i]?.v ?? 0), 0);
	}

	/** Credits the current selection must reach (buy being paid, or auction payment). */
	get pickRequired(): number | null {
		if (this.pending) {
			return this.pending.cost;
		}
		if (this.myPayment) {
			return this.myPaymentDue;
		}
		return null;
	}

	/** Preselect the optimal payment: least overpay, then as many (small) cards as possible. */
	suggestPayment(due: number, mustIncludeResearch = false): void {
		const me = this.me;
		if (!me) {
			return;
		}
		this.cardPick = bestPayment(me, due, mustIncludeResearch) ?? [];
	}

	/** Preselect the cheapest counting cards to get back under the hand cap. */
	suggestDiscard(): void {
		const me = this.me;
		if (!me) {
			return;
		}
		this.cardPick = me.hand
			.map((card, index) => ({ card, index }))
			.filter(({ card }) => card.t !== "research" && card.t !== "microbiotics")
			.sort((a, b) => a.card.v - b.card.v)
			.slice(0, this.discardExcess)
			.map((e) => e.index);
	}

	canBuy(type: FactoryType): boolean {
		const me = this.me;
		return !!me && canBuyFactory(me, type);
	}

	canAffordFactory(type: FactoryType): boolean {
		const me = this.me;
		return !!me && this.canBuy(type) && this.myHandValue >= FACTORIES[type].cost;
	}

	toggleCard(index: number): void {
		if (!this.interactive) {
			return;
		}
		this.cardPick = this.cardPick.includes(index)
			? this.cardPick.filter((i) => i !== index)
			: [...this.cardPick, index];
	}

	openAuction(marketIndex: number, kicker = false): void {
		const s = this.liveState;
		const price = kicker
			? KICKER_SPECS[s?.kickerMarket[marketIndex] as Kicker]?.price
			: UPGRADE_SPECS[s?.market[marketIndex] as Upgrade]?.price;
		// Staged buys reference the current hand; an auction payment would shift
		// those indices. Auction first, then stage purchases (undo re-enables it).
		if (!this.myActionTurn || price === undefined || this.turnBuys.length > 0) {
			return;
		}
		this.cancel();
		this.auctionPick = { marketIndex, bid: price, ...(kicker ? { kicker: true } : {}) };
	}

	private auctionPickMin(pick: { marketIndex: number; kicker?: boolean }): number {
		const s = this.liveState;
		if (!s) {
			return 0;
		}
		return pick.kicker
			? KICKER_SPECS[s.kickerMarket[pick.marketIndex] as Kicker].price
			: UPGRADE_SPECS[s.market[pick.marketIndex] as Upgrade].price;
	}

	bumpAuctionBid(delta: number): void {
		const pick = this.auctionPick;
		if (!pick) {
			return;
		}
		const min = this.auctionPickMin(pick);
		this.auctionPick = { ...pick, bid: Math.max(min, pick.bid + delta) };
	}

	setAuctionBid(value: number): void {
		const pick = this.auctionPick;
		if (!pick || !Number.isFinite(value)) {
			return;
		}
		const min = this.auctionPickMin(pick);
		this.auctionPick = { ...pick, bid: Math.max(min, Math.floor(value)) };
	}

	confirmAuction(): void {
		const pick = this.auctionPick;
		if (!pick) {
			return;
		}
		this.send({
			action: "auction",
			marketIndex: pick.marketIndex,
			bid: pick.bid,
			...(pick.kicker ? { kicker: true } : {}),
		});
	}

	prepareBid(): void {
		const s = this.liveState;
		if (!s?.auction) {
			return;
		}
		// fastBid: the floor is the list price, not the (hidden) high bid.
		this.bidAmount = s.auction.bids ? auctionCard(s.auction).price : s.auction.highBid + 1;
	}

	confirmBid(): void {
		const s = this.liveState;
		if (!s?.auction || !this.myBidTurn) {
			return;
		}
		const amount = Math.floor(this.bidAmount);
		const min = s.auction.bids ? auctionCard(s.auction).price : s.auction.highBid + 1;
		if (!Number.isInteger(amount) || amount < min || amount > this.maxBid) {
			return;
		}
		this.send({ action: "bid", amount });
	}

	passBid(): void {
		if (this.myBidTurn) {
			this.send({ action: "bidPass" });
		}
	}

	startFactoryPayment(factory: FactoryType): void {
		const me = this.me;
		if (!this.myActionTurn || !me || !this.canBuy(factory)) {
			return;
		}
		this.cancel();
		this.pending = { kind: "factory", factory, cost: FACTORIES[factory].cost };
		this.suggestPayment(FACTORIES[factory].cost, FACTORIES[factory].needsResearchCard === true);
	}

	startPopulationPayment(): void {
		const me = this.me;
		if (!this.myActionTurn || !me) {
			return;
		}
		const cost = populationCost(me);
		if (me.population >= populationMax(me) || this.myHandValue < cost) {
			return;
		}
		this.cancel();
		this.pending = { kind: "population", count: 1, cost };
		this.suggestPayment(cost);
	}

	startRobotsPayment(): void {
		const me = this.me;
		if (!this.myActionTurn || !me) {
			return;
		}
		if (me.upgrades.robots === 0 || me.robots >= robotMax(me) || this.myHandValue < 10) {
			return;
		}
		this.cancel();
		this.pending = { kind: "robots", count: 1, cost: 10 };
		this.suggestPayment(10);
	}

	bumpPendingCount(delta: number): void {
		const me = this.me;
		const pending = this.pending;
		if (!me || !pending || pending.kind === "factory") {
			return;
		}
		const unit = pending.kind === "population" ? populationCost(me) : 10;
		const cap = pending.kind === "population" ? populationMax(me) - me.population : robotMax(me) - me.robots;
		const affordable = Math.max(1, Math.floor(this.myHandValue / unit));
		const max = Math.max(1, Math.min(cap, affordable));
		const count = Math.min(max, Math.max(1, pending.count + delta));
		this.pending = { ...pending, count, cost: count * unit };
		this.suggestPayment(count * unit);
	}

	pendingValid(): boolean {
		const me = this.me;
		const pending = this.pending;
		if (!me || !pending) {
			return false;
		}
		if (this.pickTotal() < pending.cost) {
			return false;
		}
		if (pending.kind === "factory" && FACTORIES[pending.factory].needsResearchCard) {
			return this.cardPick.some((i) => me.hand[i]?.t === "research");
		}
		return true;
	}

	paymentValid(): boolean {
		return !!this.me && this.pickTotal() >= this.myPaymentDue;
	}

	confirmPayment(): void {
		if (!this.myPayment || !this.paymentValid()) {
			return;
		}
		this.send({ action: "pay", cards: this.cardPick });
	}

	// Stage the purchase locally: it is only sent with the endTurn move. Card
	// indices are relative to the draft hand, which is exactly how the engine
	// applies the steps in order.
	confirmPending(): void {
		const pending = this.pending;
		if (!pending || !this.pendingValid() || this.playerIndex === undefined) {
			return;
		}
		const cards = this.cardPick;
		const buy: TurnBuy =
			pending.kind === "factory"
				? { buy: "factory", factory: pending.factory, cards }
				: pending.kind === "population"
					? { buy: "population", count: pending.count, cards }
					: { buy: "robots", count: pending.count, cards };
		const base = this.draft ?? this.liveState;
		if (!base) {
			return;
		}
		try {
			const clone = JSON.parse(JSON.stringify(base)) as GameState;
			applyTurnBuy(clone, clone.players[this.playerIndex] as PlayerState, buy);
			this.draft = clone;
			this.turnBuys = [...this.turnBuys, buy];
		} catch {
			return;
		}
		this.cardPick = [];
		this.pending = null;
	}

	undoBuy(): void {
		if (this.turnBuys.length === 0) {
			return;
		}
		this.turnBuys = this.turnBuys.slice(0, -1);
		this.cardPick = [];
		this.pending = null;
		this.rebuildDraft();
	}

	confirmDiscard(): void {
		const me = this.me;
		if (!this.iMustDiscard || !me || this.cardPick.length === 0) {
			return;
		}
		const remaining = me.hand.filter((_, i) => !this.cardPick.includes(i));
		const counting = remaining.filter((c) => c.t !== "research" && c.t !== "microbiotics").length;
		if (counting > handCapacity(me)) {
			return;
		}
		this.send({ action: "discard", cards: this.cardPick });
	}

	/** Toggle a staged draw's mega selection; only whole groups of 4 of one resource can be formed. */
	toggleMega(index: number): void {
		if (!this.myMega) {
			return;
		}
		this.megaPick = this.megaPick.includes(index)
			? this.megaPick.filter((i) => i !== index)
			: [...this.megaPick, index];
	}

	/** Selected draws form valid mega groups: each resource contributes a multiple of 4. */
	get megaPickValid(): boolean {
		const me = this.me;
		if (!me?.pendingMega) {
			return false;
		}
		const counts = new Map<string, number>();
		for (const i of this.megaPick) {
			const t = me.pendingMega[i]?.t;
			if (t === undefined) {
				return false;
			}
			counts.set(t, (counts.get(t) ?? 0) + 1);
		}
		for (const count of counts.values()) {
			if (count % 4 !== 0) {
				return false;
			}
		}
		return true;
	}

	confirmMega(): void {
		if (!this.myMega || !this.megaPickValid) {
			return;
		}
		this.send({ action: "mega", cards: this.megaPick });
	}

	startManning(): void {
		const me = this.me;
		if (!this.myActionTurn || !me) {
			return;
		}
		this.cancel();
		this.manning = true;
		// Sensible default: keep last round's assignment, then fill any spare
		// operators into the most productive unmanned factories (deck average).
		const operators = me.population + me.robots;
		const pick = me.factories.flatMap((f, i) => (f.manned ? [i] : [])).slice(0, operators);
		const spare = me.factories
			.map((f, index) => ({ index, value: PRODUCTION_DECKS[f.type].average }))
			.filter(({ index }) => !pick.includes(index))
			.sort((a, b) => b.value - a.value);
		for (const { index } of spare) {
			if (pick.length >= operators) {
				break;
			}
			pick.push(index);
		}
		this.manningPick = pick;
	}

	toggleManning(index: number): void {
		const me = this.me;
		if (!this.manning || !me) {
			return;
		}
		const limit = me.population + me.robots;
		if (this.manningPick.includes(index)) {
			this.manningPick = this.manningPick.filter((i) => i !== index);
		} else if (this.manningPick.length < limit) {
			this.manningPick = [...this.manningPick, index];
		}
	}

	confirmEndTurn(): void {
		if (!this.manning) {
			return;
		}
		const move: Move = { action: "endTurn", buys: this.turnBuys, manned: this.manningPick };
		this.turnBuys = [];
		this.draft = null;
		this.send(move);
	}

	cancel(): void {
		this.cardPick = [];
		this.megaPick = [];
		this.pending = null;
		this.auctionPick = null;
		this.manning = false;
		this.manningPick = [];
		this.exchangeCard = null;
		this.exchangeTarget = null;
		this.autoSuggested = false;
	}

	private send(move: Move): void {
		this.bridge.sendMove(move);
		this.cancel();
		this.applyOptimistic(move);
	}

	// Apply my own move to the local (stripped) state right away so the UI feels
	// instant; the authoritative state from the server reconciles on arrival.
	// Only attempted with a move that's legal against my view — any failure just
	// skips the optimistic step (the server state will correct it).
	private applyOptimistic(move: Move): void {
		const s = this.liveState;
		if (!s || this.playerIndex === undefined || this.replay.active) {
			return;
		}
		try {
			const clone = JSON.parse(JSON.stringify(s)) as GameState;
			applyMove(clone, move, this.playerIndex);
			this.setState(clone);
		} catch {
			// not applicable against the stripped view — wait for the server state
		}
	}
}

export function createStore(bridge: ViewerBridge): ViewerStore {
	return new ViewerStore(bridge);
}
