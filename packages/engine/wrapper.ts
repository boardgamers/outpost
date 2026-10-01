import { PRODUCTION_DECKS, KICKER_SPECS, UPGRADE_SPECS } from "./src/data.js";
import { nextInt, shuffle } from "./src/prng.js";
import { RESOURCES } from "./src/types.js";
import { maxBid, needsMegaChoice } from "./src/state.js";
import { moveAI as moveAICore } from "./src/ai.js";
import { describeLogEntry } from "./src/describe.js";
import { applyMove, dropPlayer as dropPlayerCore, initGame } from "./src/moves.js";
import { rankings as computeRankings } from "./src/rankings.js";
import { replay as replayCore } from "./src/replay.js";
import { availableMoves, scores as computeScores } from "./src/state.js";
import { KICKERS, type GameState, type Kicker, type LogEntry, type Move, type ProductionCard } from "./src/types.js";

/**
 * The face-down Kicker piles' draw order is secret, but the multiset of their
 * contents is public (initial copies minus the public market and owned cards).
 * Sort each pile into canonical order so the counts are visible without
 * leaking what comes next.
 */
function sortedPile(pile: Kicker[]): Kicker[] {
	return [...pile].sort((a, b) => KICKERS.indexOf(a) - KICKERS.indexOf(b));
}

export async function init(
	players: number,
	expansions: string[],
	options: Record<string, unknown>,
	seed: string,
	_creator?: number
): Promise<GameState> {
	// The Kicker expansion is a native BGS expansion (name "kicker" on the
	// gameinfo doc); map it onto the internal option. The options.kicker check
	// stays for saved games created back when it was a plain checkbox option.
	const merged = { ...(options ?? {}), ...(expansions.includes("kicker") ? { kicker: true } : {}) };
	return initGame(players, merged, seed);
}

export async function move(data: GameState, mv: unknown, player: number): Promise<GameState> {
	// mv is untrusted JSON from the network; applyMove validates it before use.
	return applyMove(data, mv as Move, player);
}

export function ended(data: GameState): boolean {
	return data.ended;
}

export function scores(data: GameState): number[] {
	return computeScores(data);
}

export function rankings(data: GameState): number[] {
	return computeRankings(data);
}

export async function dropPlayer(data: GameState, player: number): Promise<GameState> {
	return dropPlayerCore(data, player);
}

export async function moveAI(data: GameState, player: number): Promise<GameState> {
	return moveAICore(data, player);
}

export function currentPlayer(data: GameState): number | number[] | undefined {
	if (data.ended) {
		return undefined;
	}
	switch (data.phase) {
		case "mega": {
			const waiting = data.players.flatMap((p, seat) => (needsMegaChoice(p) ? [seat] : []));
			return waiting.length === 1 ? waiting[0] : waiting;
		}
		case "discard": {
			const waiting = data.players.flatMap((p, seat) => (p.mustDiscard && !p.dropped ? [seat] : []));
			return waiting.length === 1 ? waiting[0] : waiting;
		}
		case "exchange":
			return data.exchange?.seat;
		case "auction": {
			// fastBid: everyone who hasn't bid yet is on the clock at once.
			if (data.auction?.bids) {
				const pending = data.players.flatMap((p, seat) =>
					!p.dropped && data.auction?.bids?.[seat] === undefined ? [seat] : []
				);
				return pending.length === 1 ? pending[0] : pending;
			}
			return data.auction?.activeBidder;
		}
		case "auctionPayment":
			return data.auction?.highBidder;
		case "actions":
			return data.activeSeat;
		default:
			return undefined;
	}
}

export function logLength(data: GameState): number {
	return data.log.length;
}

/** Rule 12.1: production draws stay hidden until all mega elections are resolved. */
function hideOwnProduction(data: GameState, viewer: number | undefined): boolean {
	if (data.phase !== "mega" || viewer === undefined) {
		return false;
	}
	return (data.players[viewer]?.pendingMega?.length ?? 0) > 0;
}

function hideProduced(
	entry: LogEntry,
	viewer: number | undefined,
	fastBid: boolean,
	hideOwnProduction = false,
	sealedBidVisible = false,
	gameEnded = false,
	exchangeOngoing = false
): LogEntry {
	if (entry.type === "init") {
		// The seed derives every deck order; it must never reach a client.
		return { ...entry, seed: "" };
	}
	if (fastBid && entry.type === "move" && entry.move.action === "bid" && entry.player !== viewer && !sealedBidVisible) {
		// fastBid: another player's sealed bid stays hidden while its auction
		// runs; once the auction resolves every bid is revealed, including
		// losing ones. Sequential auctions keep every bid public throughout.
		return { ...entry, move: { action: "bid", amount: -1 } };
	}
	if (
		fastBid &&
		!sealedBidVisible &&
		entry.type === "move" &&
		entry.move.action === "auction" &&
		entry.player !== viewer
	) {
		// fastBid: the auctioneer's opening bid is their sealed bid — it stays
		// hidden from the other players like any sealed bid. In a sequential
		// auction the opening bid is the public high bid, so it is not masked.
		return { ...entry, move: { ...entry.move, bid: -1 } };
	}
	if (entry.type === "move" && entry.move.action === "exchange" && entry.info) {
		// The received card is parked on the Wily Trader / Merchant House until
		// the exchange step ends, so its value stays hidden from everyone while
		// the step runs. The offered card's value and the received value are
		// additionally the two participants' secret from the rest of the table
		// until the game ends.
		const participant = viewer !== undefined && (viewer === entry.player || viewer === entry.move.target);
		if (exchangeOngoing) {
			const info = { ...entry.info, exchangeValue: -1 };
			if (!participant && !gameEnded && info.exchangeGiven) {
				info.exchangeGiven = { ...info.exchangeGiven, v: -1 };
			}
			return { ...entry, info };
		}
		if (!participant && !gameEnded) {
			const info = { ...entry.info, exchangeValue: -1 };
			if (info.exchangeGiven) {
				info.exchangeGiven = { ...info.exchangeGiven, v: -1 };
			}
			return { ...entry, info };
		}
		return entry;
	}
	if (entry.type !== "round") {
		return entry;
	}
	return {
		...entry,
		// The face-down Kicker piles' draw order is secret; sort to show counts.
		...(entry.kickerPiles
			? {
					kickerPiles: {
						1: sortedPile(entry.kickerPiles[1]),
						2: sortedPile(entry.kickerPiles[2]),
						3: sortedPile(entry.kickerPiles[3]),
					},
				}
			: {}),
		produced: entry.produced.map(({ player, cards }) => ({
			player,
			// hideOwnProduction: the viewer's own draws stay hidden while their
			// mega election is pending (rule 12.1 — the choice is blind).
			cards: player === viewer && !hideOwnProduction ? cards : cards.map((c): ProductionCard => ({ t: c.t, v: -1 })),
		})),
	};
}

/**
 * fastBid reveal: the log indexes whose sealed bids are public because their
 * auction has already resolved by that point. The resolving move itself (the
 * one carrying info.winningBid) is where the bids turn visible, so its own
 * index is included. A stripped log is the source of truth for replays, so
 * the reveal must be derivable from the stripped entries alone — it is: the
 * resolution outcome (winningBid/secondBid/winner) is deliberately never
 * masked, and auction boundaries are marked by "auction" moves.
 */
function revealedBidIndexes(log: LogEntry[]): Set<number> {
	const revealed = new Set<number>();
	// Indexes of the bid moves of the auction currently collecting sealed bids.
	let pending: number[] = [];
	for (let i = 0; i < log.length; i++) {
		const entry = log[i] as LogEntry;
		if (entry.type !== "move") {
			continue;
		}
		if (entry.move.action === "auction") {
			pending = [i];
			continue;
		}
		if (entry.move.action === "bid") {
			pending.push(i);
		}
		if (entry.info?.winningBid !== undefined) {
			// The auction resolves here: every sealed bid of it is revealed.
			for (const j of pending) {
				revealed.add(j);
			}
			revealed.add(i);
			pending = [];
		}
	}
	return revealed;
}

export function stripSecret(data: GameState, player?: number): GameState {
	const viewer = player !== undefined && player >= 0 ? player : undefined;
	// fastBid: other players' sealed bids are hidden while the auction runs.
	const auction = data.auction;
	const maskedAuction =
		auction?.bids && data.phase === "auction"
			? {
					...auction,
					highBid: auction.auctioneer === viewer ? auction.highBid : -1,
					bids: Object.fromEntries(
						Object.entries(auction.bids).map(([seat, amount]) => [seat, Number(seat) === viewer ? amount : -1])
					),
				}
			: auction;
	// The cards parked on a Wily Trader / Merchant House this phase were taken
	// from other players' hands and sit face-down until the exchange step ends,
	// so their values are hidden from EVERYONE while the step runs — the seat
	// that parked them included (it only learns the value when the card lands).
	const exchange = data.exchange;
	const maskedExchange = exchange
		? {
				...exchange,
				parked: exchange.parked.map(({ seat, card }) => ({
					seat,
					card: { t: card.t, v: card.m ? card.v : -1, ...(card.m ? { m: true as const } : {}) },
				})),
			}
		: exchange;
	return {
		...data,
		// The seed derives every deck order; hiding it is what keeps hands secret.
		seed: "",
		auction: maskedAuction,
		exchange: maskedExchange,
		decks: Object.fromEntries(
			Object.entries(data.decks).map(([resource, deck]) => [resource, deck.map(() => -1)])
		) as GameState["decks"],
		// The face-down Kicker piles' draw order is secret; their (public) counts
		// are shown by sorting into canonical order.
		kickerPiles: {
			1: sortedPile(data.kickerPiles[1]),
			2: sortedPile(data.kickerPiles[2]),
			3: sortedPile(data.kickerPiles[3]),
		},
		players: data.players.map((p, i) => {
			if (i === viewer) {
				// Rule 12.1: the mega election is blind — the player's own pending
				// draw values stay hidden until all choices resolve (mega phase only).
				if (data.phase === "mega" && (p.pendingMega?.length ?? 0) > 0) {
					return { ...p, pendingMega: p.pendingMega?.map((c): ProductionCard => ({ t: c.t, v: -1 })) };
				}
				return p;
			}
			return {
				...p,
				settings: {},
				...(p.megaChoice !== undefined ? { megaChoice: {} } : {}),
				hand: p.hand.map((c): ProductionCard => ({ t: c.t, v: c.m ? c.v : -1, ...(c.m ? { m: true } : {}) })),
				pendingMega: p.pendingMega?.map(
					(c): ProductionCard => ({
						t: c.t,
						v: c.m ? c.v : -1,
						...(c.m ? { m: true } : {}),
					})
				),
			};
		}),
		log: maskLog(data, viewer),
		messages: [...data.messages],
	};
}

/**
 * The log as a viewer sees it: hidden values masked, resolved sealed bids
 * revealed. `start`/`end` slice the absolute log indexes; `revealed` is always
 * computed on the full log so a slice of a resolved auction still shows its bids.
 */
function maskLog(
	data: GameState,
	viewer: number | undefined,
	start = 0,
	end = data.log.length
): (LogEntry & { simple?: string })[] {
	const revealed = revealedBidIndexes(data.log);
	const hideOwn = hideOwnProduction(data, viewer);
	// An exchange's received card is parked on the upgrade until the exchange
	// step (end of the discard phase) closes, i.e. while data.exchange is set.
	const exchangeOngoing = data.exchange != null && !data.ended;
	let productionStart = data.log.length;
	if (data.phase === "mega" && !data.ended) {
		while (productionStart > 0 && data.log[productionStart - 1]?.type !== "round") {
			productionStart--;
		}
	}
	return data.log.slice(start, end).map((entry, i) => {
		if (
			i + start >= productionStart &&
			entry.type === "move" &&
			entry.move.action === "mega" &&
			entry.player !== viewer
		) {
			return { ...entry, move: { action: "mega" as const, take: {} }, info: { megaSealed: true as const } };
		}
		return hideProduced(
			entry,
			viewer,
			data.options.fastBid === true,
			hideOwn,
			revealed.has(i + start),
			data.ended,
			exchangeOngoing
		);
	});
}

export interface LogSliceOptions {
	player?: number;
	start?: number;
	end?: number;
}

export interface LogSliceResult {
	// Entries carry an extra plain-text `simple` line for the game-server's
	// last-move summary (its logEntryText probes for simple/message/text).
	log: (LogEntry & { simple?: string })[];
	availableMoves?: string[];
}

export function logSlice(data: GameState, options?: LogSliceOptions): LogSliceResult {
	const viewer = options?.player !== undefined && options.player >= 0 ? options.player : undefined;
	const start = Math.max(0, options?.start ?? 0);
	const end = options?.end ?? data.log.length;
	// Each entry also carries a plain-text `simple` line: the game-server's
	// lastMoveText probes entries for simple/message/text to show the last move
	// in the game list, and our structured entries otherwise stringify to noise.
	// describeLogEntry never reveals hidden values (unresolved sealed bids,
	// exchange takes).
	const log = maskLog(data, viewer, start, end).map((masked) => ({
		...masked,
		simple: describeLogEntry(data, masked),
	}));
	const result: LogSliceResult = { log };
	if (options?.end === undefined) {
		result.availableMoves = availableMoves(data, viewer);
	}
	return result;
}

export function setPlayerMetaData(data: GameState, player: number, metaData: { name: string }): GameState {
	const target = data.players[player];
	if (target) {
		target.name = metaData.name;
	}
	return data;
}

export function setPlayerSettings(data: GameState, player: number, settings: Record<string, unknown>): GameState {
	const target = data.players[player];
	if (target) {
		// The game-server already whitelisted and typed these against the declared
		// settings; keep only the ones this engine understands.
		target.settings = {
			autoPassBids: settings.autoPassBids === true,
			autoMega: settings.autoMega === "maximum" || settings.autoMega === "singles" ? settings.autoMega : "ask",
		};
	}
	return data;
}

export function playerSettings(data: GameState, player: number): Record<string, unknown> {
	// Optional chain: states saved before the settings field existed lack it.
	return {
		autoPassBids: data.players[player]?.settings?.autoPassBids === true,
		autoMega: data.players[player]?.settings?.autoMega ?? "ask",
	};
}

// Every state must be persisted: the platform keeps no memory between requests
// (each move reloads the saved state), bids interleave seats so they cannot be
// resent as one player's tentative turn, and dropPlayer / setPlayerSettings
// also persist through toSave. Time farming via many small moves is prevented
// structurally instead: a whole action turn (purchases + manning) is a single
// composite endTurn move.
export function toSave(data: GameState): GameState {
	return data;
}

export function messages(data: GameState): { messages: string[]; data: GameState } {
	const drained = [...data.messages];
	data.messages = [];
	return { messages: drained, data };
}

export function replay(data: GameState, options?: { to?: number }): GameState {
	return replayCore(data, options);
}

export const stripSecretLike = stripSecret;

export function round(data: GameState): number {
	return data.round;
}

export function cancelled(data: GameState): boolean {
	return data.ended && data.round <= 1;
}

export function factions(data: GameState): string[] {
	return data.players.map((p) => p.name);
}

export function createAnalysis(data: GameState, { to }: { to: number; sourceEnded: boolean }): GameState {
	if (!Number.isInteger(to) || to < 0 || to > data.log.length) {
		throw new Error("Invalid history position");
	}
	const first = data.log[0];
	if (!first || first.type !== "init") {
		throw new Error("Missing initial state");
	}
	const copy = to === data.log.length ? structuredClone(data) : initGame(first.players, first.options, first.seed);
	if (to !== data.log.length) {
		for (const entry of data.log.slice(0, to)) {
			if (entry.type !== "move") {
				continue;
			}
			copy.players.forEach((player, seat) => {
				player.settings = { autoPassBids: entry.info?.autoPassed?.includes(seat) ?? false };
			});
			applyMove(copy, entry.move, entry.player);
		}
	}
	copy.players.forEach((player, seat) => {
		player.name = data.players[seat]!.name;
		player.dropped = false;
		player.settings = { autoPassBids: false };
	});
	copy.messages = [];
	return copy;
}

export function createAnalysisScenario(
	data: GameState,
	{ player, seed }: { player?: number; seed: string }
): GameState {
	if (!canLaunchAnalysisMode(data)) {
		throw new Error("Finish the current exchange before starting analysis");
	}
	const observed = structuredClone(stripSecret(data, player));
	const knowledge =
		data.analysisKnowledge ??
		(() => {
			const replayed = observed.log[0]?.type === "init" ? replayCore(observed, { trackKnowledge: true }) : undefined;
			const bidFloors = observed.players.map(() => 0);
			if (observed.auction) {
				let start = observed.log.length;
				for (let i = observed.log.length - 1; i >= 0; i--) {
					const e = observed.log[i]!;
					if (e.type === "move" && e.move.action === "auction") {
						start = i;
						break;
					}
				}
				for (const e of observed.log.slice(start)) {
					if (e.type !== "move") {
						continue;
					}
					const amount = e.move.action === "auction" ? e.move.bid : e.move.action === "bid" ? e.move.amount : 0;
					bidFloors[e.player] = Math.max(bidFloors[e.player]!, amount);
				}
				for (const [seat, amount] of Object.entries(observed.auction.bids ?? {})) {
					bidFloors[Number(seat)] = Math.max(bidFloors[Number(seat)]!, amount);
				}
			}
			const parked = observed.exchange?.parked.map(() => ({ min: 0 }) as { min: number; max?: number });
			if (parked?.length) {
				const entries = observed.log
					.filter((e) => e.type === "move" && e.move.action === "exchange")
					.slice(-parked.length);
				entries.forEach((e, index) => {
					if (e.type === "move" && (e.info?.exchangeGiven?.v ?? -1) >= 0) {
						const value = e.info!.exchangeGiven!.v;
						parked[index] = (e.info!.exchangeTake ?? -1) < 0 ? { min: value, max: value } : { min: value + 1 };
					}
				});
			}
			return { hands: replayed?.players.map((p) => p.hand) ?? observed.players.map((p) => p.hand), bidFloors, parked };
		})();
	observed.analysisKnowledge = structuredClone(knowledge);
	for (const [seat, p] of observed.players.entries()) {
		if (seat === player) {
			continue;
		}
		const known = knowledge.hands[seat]!;
		if (known.length !== p.hand.length) {
			throw new Error("Cannot reconstruct known hand positions");
		}
		p.hand.forEach((card, i) => {
			if (known[i]!.t !== card.t) {
				throw new Error("Cannot reconstruct known card types");
			}
			if (known[i]!.v >= 0) {
				card.v = known[i]!.v;
			}
		});
	}
	observed.seed = seed;
	observed.rngCounter = 0;
	observed.log = [];
	observed.messages = [];
	observed.options = { fastBid: data.options.fastBid === true, kicker: data.options.kicker === true };
	for (const p of observed.players) {
		p.dropped = false;
		p.settings = { autoPassBids: false };
	}
	for (let attempt = 0; attempt < 10000; attempt++) {
		const copy = structuredClone(observed);
		copy.rngCounter = attempt * 10000;
		for (const resource of RESOURCES) {
			const spec = PRODUCTION_DECKS[resource];
			const pool = Object.entries(spec.distribution).flatMap(([v, count]) => Array<number>(count).fill(Number(v)));
			const cards = copy.players
				.flatMap((p) => [...p.hand, ...(p.pendingMega ?? [])])
				.concat(copy.exchange?.parked.map((p) => p.card) ?? [])
				.filter((c) => c.t === resource && !c.m);
			const remove = (v: number) => {
				const index = pool.indexOf(v);
				if (index >= 0) {
					pool.splice(index, 1);
				}
			};
			copy.discards[resource].forEach(remove);
			cards.filter((c) => c.v >= 0).forEach((c) => remove(c.v));
			const unknown = cards.filter((c) => c.v < 0);
			const required = unknown.length + copy.decks[resource].length;
			while (pool.length < required) {
				pool.push(spec.average);
			}
			shuffle(copy, pool);
			for (const c of unknown) {
				c.v = pool.pop()!;
			}
			copy.decks[resource] = pool.slice(0, copy.decks[resource].length);
		}
		if (
			knowledge.parked?.some((bound, index) => {
				const value = copy.exchange?.parked[index]?.card.v;
				return value !== undefined && (value < bound.min || (bound.max !== undefined && value > bound.max));
			})
		) {
			continue;
		}
		for (const era of [1, 2, 3] as const) {
			shuffle(copy, copy.kickerPiles[era]);
		}
		if (
			knowledge.hands.some((hand, seat) =>
				hand.some((card, index) => {
					const value = copy.players[seat]!.hand[index]!.v;
					const bounds = card.analysisBounds;
					return (
						(bounds?.max !== undefined && value > bounds.max) ||
						bounds?.excluded?.some(([low, high]) => value > low && value < high)
					);
				})
			)
		) {
			continue;
		}
		const a = copy.auction;
		if (a) {
			if (knowledge.bidFloors.some((amount, seat) => amount > maxBid(copy, seat, a.upgrade))) {
				continue;
			}
			if (a.bids && copy.phase === "auction") {
				const floor = a.kicker ? KICKER_SPECS[a.kicker].price : UPGRADE_SPECS[a.upgrade!].price;
				if (maxBid(copy, a.auctioneer, a.upgrade) < floor) {
					continue;
				}
				let valid = true;
				for (const [seat, amount] of Object.entries(a.bids)) {
					const max = maxBid(copy, Number(seat), a.upgrade);
					if (amount < 0) {
						a.bids[seat] =
							Number(seat) === a.auctioneer
								? floor + nextInt(copy, max - floor + 1)
								: max < floor + 1
									? 0
									: (() => {
											const choice = nextInt(copy, max - floor + 1);
											return choice === 0 ? 0 : floor + choice;
										})();
					} else if (amount > max) {
						valid = false;
					}
				}
				if (!valid) {
					continue;
				}
				a.highBid = a.bids[String(a.auctioneer)]!;
			} else if (maxBid(copy, a.highBidder, a.upgrade) < a.highBid) {
				continue;
			}
		}
		return copy;
	}
	throw new Error("Cannot simulate a production allocation compatible with the current auction");
}

export function canLaunchAnalysisMode(data: GameState): boolean {
	if (!data.exchange || !data.exchange.parked.length) {
		return true;
	}
	return !data.log
		.filter((e) => e.type === "move" && e.move.action === "exchange")
		.slice(-data.exchange.parked.length)
		.some((e) => e.type === "move" && (e.info?.exchangeTake ?? -1) >= 0);
}
