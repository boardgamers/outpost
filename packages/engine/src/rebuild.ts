import { applyMove, dropPlayer, initGame } from "./moves.js";
import type { GameState } from "./types.js";

/**
 * The exact saved state after the first `to` log entries — decks, discards and the PRNG
 * counter included — rebuilt from the seed by re-applying the logged moves. BGS restores
 * positions this way (undo against bots, admin replays); `replay` instead rebuilds a
 * possibly secret-stripped log for display without consuming randomness. Names, settings
 * and drops are not logged, so the current ones are kept. Throws rather than rebuilding a
 * different history when the log cannot be reproduced (e.g. drops before `to`).
 */
export function rebuild(data: GameState, options?: { to?: number }): GameState {
	const init = data.log[0];
	if (init?.type !== "init" || !init.seed) {
		throw new Error("The game log has no seed to rebuild from");
	}
	const to = Math.min(options?.to ?? data.log.length, data.log.length);
	if (!Number.isInteger(to) || to < 1) {
		throw new Error("Invalid history position");
	}
	const state = initGame(init.players, structuredClone(init.options), init.seed);
	verify(data, state, 0);
	while (state.log.length < to) {
		const index = state.log.length;
		const entry = data.log[index];
		if (entry?.type !== "move") {
			throw new Error(`Cannot rebuild the game at log entry ${index}`);
		}
		// Automatic choices were recorded when they happened (auto-passes on the move that
		// caused them, Mega choices as moves), so today's settings must not repeat them.
		state.players.forEach((player, seat) => {
			player.settings = { autoPassBids: entry.info?.autoPassed?.includes(seat) ?? false };
		});
		try {
			applyMove(state, entry.move, entry.player);
		} catch (error) {
			throw new Error(`Cannot rebuild the game at log entry ${index}: ${(error as Error).message}`);
		}
		if (state.log.length <= index) {
			throw new Error(`Cannot rebuild the game at log entry ${index}`);
		}
		verify(data, state, index);
	}
	state.log = structuredClone(data.log.slice(0, state.log.length));
	data.players.forEach((source, seat) => {
		const player = state.players[seat]!;
		player.name = source.name;
		player.settings = structuredClone(source.settings ?? {});
	});
	data.players.forEach((source, seat) => {
		if (source.dropped) {
			dropPlayer(state, seat);
		}
	});
	state.messages = [];
	return state;
}

function verify(data: GameState, state: GameState, from: number): void {
	for (let index = from; index < state.log.length; index++) {
		const recorded = data.log[index];
		if (recorded === undefined || !covers(state.log[index], recorded)) {
			throw new Error(`The game log cannot be reproduced from entry ${index}`);
		}
	}
}

/** Whether `actual` holds every recorded value; fields added to log entries since are ignored. */
function covers(actual: unknown, recorded: unknown): boolean {
	if (actual === recorded) {
		return true;
	}
	if (typeof actual !== "object" || typeof recorded !== "object" || actual === null || recorded === null) {
		return false;
	}
	if (Array.isArray(recorded) || Array.isArray(actual)) {
		return (
			Array.isArray(recorded) &&
			Array.isArray(actual) &&
			actual.length === recorded.length &&
			recorded.every((item, index) => covers(actual[index], item))
		);
	}
	return Object.entries(recorded).every(
		([key, value]) => value === undefined || covers((actual as Record<string, unknown>)[key], value)
	);
}
