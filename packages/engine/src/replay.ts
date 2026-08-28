import {
	applyMove,
	enterMegaPhase,
	setReplayAutoPassed,
	setReplayExchangeTake,
	setReplayFastResolve,
	setReplayMode,
} from "./moves.js";
import { megaGroupsFor, setup } from "./state.js";
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
				// auto-pass cannot be recomputed from a stripped log). Same for a
				// fastBid resolution: the other sealed bids are hidden.
				setReplayAutoPassed(entry.info?.autoPassed ?? []);
				if (entry.info?.winningBid !== undefined) {
					setReplayFastResolve(entry.info.winningBid, entry.info.secondBid ?? 0, entry.info.winner ?? entry.player);
				}
				setReplayExchangeTake(entry.info?.exchangeTake ?? -1);
				applyMove(replayed, entry.move, entry.player);
			}
		}
	} finally {
		setReplayMode(false);
		setReplayAutoPassed([]);
		setReplayFastResolve(0, 0, -1);
		setReplayExchangeTake(-1);
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
	if (entry.kickerMarket) {
		state.kickerMarket = [...entry.kickerMarket];
	}
	if (entry.kickerEra !== undefined) {
		state.kickerEra = entry.kickerEra;
	}
	if (entry.kickerPiles) {
		state.kickerPiles = { 1: [...entry.kickerPiles[1]], 2: [...entry.kickerPiles[2]], 3: [...entry.kickerPiles[3]] };
	}
	if (entry.eraStreak4 !== undefined) {
		state.eraStreak4 = entry.eraStreak4;
	}
	if (entry.eraStreak10 !== undefined) {
		state.eraStreak10 = entry.eraStreak10;
	}
	for (const { player: seat, cards } of entry.produced) {
		const player = state.players[seat];
		if (player) {
			// Stage as pending draws; the following "mega" moves confirm the
			// mega-vs-singles choice exactly as live. Eligibility (rule 12.1) is
			// recorded on the round entry; older logs without it fall back to the
			// factories manned this round.
			player.pendingMega = cards.map((c) => ({ ...c }));
			const recorded = entry.megaGroups?.find((m) => m.player === seat)?.groups;
			player.megaGroups = recorded ? { ...recorded } : megaGroupsFor(player);
		}
	}
	// The round entry was already recorded by the source log; keep the replayed
	// log aligned so log indexes match between original and replay.
	state.log.push(entry);
	enterMegaPhase(state);
}
