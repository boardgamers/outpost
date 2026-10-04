import { needsMegaChoice } from "./state.js";
import type { GameState, Move } from "./types.js";

export function choiceRevision(state: GameState, seat: number): string | undefined {
	const player = state.players[seat];
	if (state.ended || !player || player.dropped) {
		return undefined;
	}
	if (state.phase === "mega" && player.megaChoice !== undefined && state.players.some(needsMegaChoice)) {
		return `mega:${state.round}`;
	}
	if (
		state.phase === "auction" &&
		state.auction?.bids?.[seat] !== undefined &&
		state.players.some((p, i) => !p.dropped && state.auction?.bids?.[i] === undefined)
	) {
		const start = state.log.map((e) => e.type === "move" && e.move.action === "auction").lastIndexOf(true);
		return `auction:${state.round}:${start}`;
	}
	return undefined;
}

export function canReviseChoice(state: GameState, raw: unknown, seat: number): boolean {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return false;
	}
	const move = raw as Move;
	const key = choiceRevision(state, seat);
	if (!key || !("revision" in move) || move.revision !== key) {
		return false;
	}
	return state.phase === "mega"
		? move.action === "mega"
		: move.action === "bid" || (move.action === "bidPass" && seat !== state.auction?.auctioneer);
}
