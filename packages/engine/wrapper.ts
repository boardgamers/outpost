import { moveAI as moveAICore } from "./src/ai.js";
import { describeLogEntry } from "./src/describe.js";
import { applyMove, dropPlayer as dropPlayerCore, initGame } from "./src/moves.js";
import { rankings as computeRankings } from "./src/rankings.js";
import { replay as replayCore } from "./src/replay.js";
import { availableMoves, scores as computeScores } from "./src/state.js";
import type { GameState, LogEntry, Move, ProductionCard } from "./src/types.js";

export async function init(
	players: number,
	_expansions: string[],
	options: Record<string, unknown>,
	seed: string,
	_creator?: number
): Promise<GameState> {
	return initGame(players, options ?? {}, seed);
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
			const waiting = data.players.flatMap((p, seat) => ((p.pendingMega?.length ?? 0) > 0 && !p.dropped ? [seat] : []));
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

function hideProduced(entry: LogEntry, viewer: number | undefined, fastBid: boolean): LogEntry {
	if (entry.type === "init") {
		// The seed derives every deck order; it must never reach a client.
		return { ...entry, seed: "" };
	}
	if (entry.type === "move" && entry.move.action === "bid" && entry.player !== viewer) {
		// fastBid: another player's sealed bid stays hidden. Masking a
		// sequential bid too is harmless — the amount is already public via
		// auction.highBid for the seats it concerns.
		return { ...entry, move: { action: "bid", amount: -1 } };
	}
	if (fastBid && entry.type === "move" && entry.move.action === "auction" && entry.player !== viewer) {
		// fastBid: the auctioneer's opening bid is their sealed bid — it stays
		// hidden from the other players like any sealed bid. In a sequential
		// auction the opening bid is the public high bid, so it is not masked.
		return { ...entry, move: { ...entry.move, bid: -1 } };
	}
	if (entry.type === "move" && entry.move.action === "exchange" && entry.player !== viewer && entry.info) {
		// The value of the card taken from the target stays hidden from everyone
		// but the giver (it joins the giver's hand once the phase ends).
		return { ...entry, info: { ...entry.info, exchangeValue: -1 } };
	}
	if (entry.type !== "round") {
		return entry;
	}
	return {
		...entry,
		produced: entry.produced.map(({ player, cards }) => ({
			player,
			cards: player === viewer ? cards : cards.map((c): ProductionCard => ({ t: c.t, v: -1 })),
		})),
	};
}

export function stripSecret(data: GameState, player?: number): GameState {
	const viewer = player !== undefined && player >= 0 ? player : undefined;
	// fastBid: other players' sealed bids are hidden while the auction runs.
	const auction = data.auction;
	const maskedAuction =
		auction?.bids && data.phase === "auction"
			? {
					...auction,
					bids: Object.fromEntries(
						Object.entries(auction.bids).map(([seat, amount]) => [seat, Number(seat) === viewer ? amount : -1])
					),
				}
			: auction;
	// The cards parked on a Wily Trader / Merchant House this phase were taken
	// from other players' hands; their values stay hidden from everyone but the
	// seat that parked them (it is about to get them back).
	const exchange = data.exchange;
	const maskedExchange = exchange
		? {
				...exchange,
				parked: exchange.parked.map(({ seat, card }) => ({
					seat,
					card: { t: card.t, v: seat === viewer || card.m ? card.v : -1, ...(card.m ? { m: true as const } : {}) },
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
		// The face-down Kicker piles' draw order is secret; only their sizes are public.
		kickerPiles: {
			1: data.kickerPiles[1].map(() => "iceProspector" as const),
			2: data.kickerPiles[2].map(() => "launchFacility" as const),
			3: data.kickerPiles[3].map(() => "biosphere" as const),
		},
		players: data.players.map((p, i) =>
			i === viewer
				? p
				: {
						...p,
						hand: p.hand.map((c): ProductionCard => ({ t: c.t, v: c.m ? c.v : -1, ...(c.m ? { m: true } : {}) })),
						pendingMega: p.pendingMega?.map(
							(c): ProductionCard => ({
								t: c.t,
								v: c.m ? c.v : -1,
								...(c.m ? { m: true } : {}),
							})
						),
					}
		),
		log: data.log.map((entry) => hideProduced(entry, viewer, data.options.fastBid === true)),
		messages: [...data.messages],
	};
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
	// describeLogEntry never reveals hidden values (sealed bids, exchange takes).
	const log = data.log.slice(start, end).map((entry) => {
		const masked = hideProduced(entry, viewer, data.options.fastBid === true);
		return { ...masked, simple: describeLogEntry(data, masked) };
	});
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
		target.settings = { autoPassBids: settings.autoPassBids === true };
	}
	return data;
}

export function playerSettings(data: GameState, player: number): Record<string, unknown> {
	// Optional chain: states saved before the settings field existed lack it.
	return { autoPassBids: data.players[player]?.settings?.autoPassBids === true };
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
