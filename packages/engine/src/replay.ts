import { applyMove, enterDiscardPhase, setReplayAutoPassed, setReplayMode } from "./moves.js";
import { setup } from "./state.js";
import type { GameState, LogEntry } from "./types.js";

/**
 * Rebuild the game state from the log, optionally stopping after `to` entries.
 * Rounds are applied from the "round" log entries (market + production draws),
 * so a secret-stripped log replays into a secret-stripped state.
 */
export function replay(state: GameState, options?: { to?: number }): GameState {
	const init = state.log[0];
	if (!init || init.type !== "init") {
		throw new Error("log does not start with an init entry");
	}
	const to = Math.min(options?.to ?? state.log.length, state.log.length);

	const replayed = setup(init.players, init.options, init.seed);
	replayed.players.forEach((player, i) => {
		player.name = state.players[i]?.name ?? player.name;
	});

	setReplayMode(true);
	try {
		for (let i = 1; i < to; i++) {
			const entry = state.log[i] as LogEntry;
			if (entry.type === "round") {
				applyRoundEntry(replayed, entry);
			} else if (entry.type === "move") {
				// Seats the live game auto-passed during this move are recorded in
				// its info; advanceBidder replays them verbatim (the true-value
				// auto-pass cannot be recomputed from a stripped log).
				setReplayAutoPassed(entry.info?.autoPassed ?? []);
				applyMove(replayed, entry.move, entry.player);
			}
		}
	} finally {
		setReplayMode(false);
		setReplayAutoPassed([]);
	}
	return replayed;
}

function applyRoundEntry(state: GameState, entry: LogEntry & { type: "round" }): void {
	state.round = entry.round;
	// The order was computed server-side from true spent totals; a stripped
	// state cannot recompute it (spent derives from hidden card values).
	state.purchaseOrder = [...entry.purchaseOrder];
	state.market = [...entry.market];
	state.supply = { ...entry.supply };
	for (const { player: seat, cards } of entry.produced) {
		state.players[seat]?.hand.push(...cards.map((c) => ({ ...c })));
	}
	// The round entry was already recorded by the source log; keep the replayed
	// log aligned so log indexes match between original and replay.
	state.log.push(entry);
	enterDiscardPhase(state);
}
