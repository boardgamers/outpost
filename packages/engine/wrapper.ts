import { moveAI as moveAICore } from "./src/ai.js";
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
		case "discard": {
			const waiting = data.players.flatMap((p, seat) => (p.mustDiscard && !p.dropped ? [seat] : []));
			return waiting.length === 1 ? waiting[0] : waiting;
		}
		case "auction":
			return data.auction?.activeBidder;
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

function hideProduced(entry: LogEntry, viewer?: number): LogEntry {
	if (entry.type === "init") {
		// The seed derives every deck order; it must never reach a client.
		return { ...entry, seed: "" };
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
	return {
		...data,
		// The seed derives every deck order; hiding it is what keeps hands secret.
		seed: "",
		decks: Object.fromEntries(
			Object.entries(data.decks).map(([resource, deck]) => [resource, deck.map(() => -1)])
		) as GameState["decks"],
		players: data.players.map((p, i) =>
			i === viewer
				? p
				: {
						...p,
						hand: p.hand.map((c): ProductionCard => ({ t: c.t, v: -1 })),
					}
		),
		log: data.log.map((entry) => hideProduced(entry, viewer)),
		messages: [...data.messages],
	};
}

export interface LogSliceOptions {
	player?: number;
	start?: number;
	end?: number;
}

export interface LogSliceResult {
	log: LogEntry[];
	availableMoves?: string[];
}

export function logSlice(data: GameState, options?: LogSliceOptions): LogSliceResult {
	const viewer = options?.player !== undefined && options.player >= 0 ? options.player : undefined;
	const start = Math.max(0, options?.start ?? 0);
	const end = options?.end ?? data.log.length;
	const log = data.log.slice(start, end).map((entry) => hideProduced(entry, viewer));
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
