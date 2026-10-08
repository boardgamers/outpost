import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseMove } from "./ai.js";
import { choiceRevision } from "./choice-revisions.js";
import { dropPlayer } from "./moves.js";
import { replay as displayReplay } from "./replay.js";
import * as wrapper from "../wrapper.js";
import type { GameState, LogEntry } from "./types.js";

const HUMAN = 0;
const SETTINGS: Record<number, Record<string, unknown>> = {
	0: { autoPassBids: true, autoMega: "ask" },
	1: { autoMega: "maximum" },
	2: { autoMega: "singles", autoPassBids: true },
};

function saved(data: GameState): GameState {
	return JSON.parse(JSON.stringify(data)) as GameState;
}

async function start(players: number, options: Record<string, unknown>, seed: string): Promise<GameState> {
	const { kicker, ...rest } = options;
	let data = await wrapper.init(players, kicker ? ["kicker"] : [], rest, seed);
	for (let seat = 0; seat < players; seat++) {
		data = wrapper.setPlayerMetaData(data, seat, { name: `Player ${seat + 1}` });
	}
	for (const [seat, settings] of Object.entries(SETTINGS)) {
		data = wrapper.setPlayerSettings(data, Number(seat), settings);
	}
	return saved(data);
}

/**
 * Plays like BGS against bots: each operation is saved as JSON with its messages drained,
 * and the saved state before each human move is an undo point.
 */
async function play(
	data: GameState,
	undoPoints: Map<number, GameState>,
	{ limit = Infinity, until }: { limit?: number; until?: (state: GameState) => boolean } = {}
): Promise<GameState> {
	for (let operations = 0; !data.ended && operations < limit && !until?.(data); operations++) {
		const current = wrapper.currentPlayer(data);
		const seat = Array.isArray(current) ? current[0]! : current!;
		if (seat === HUMAN) {
			undoPoints.set(data.log.length, saved(data));
			data = await wrapper.move(data, chooseMove(data, HUMAN), HUMAN);
		} else {
			data = await wrapper.moveAI(data, seat);
		}
		data = saved(wrapper.messages(data).data);
	}
	return data;
}

function moveEntries(data: GameState) {
	return data.log.flatMap((entry) => (entry.type === "move" ? [entry] : []));
}

test("replay(final, { to }) restores every undo point exactly, decks, discards, PRNG and settings included", async () => {
	const covered = { endedGames: 0, autoPassed: 0, automaticMega: 0, sealedResolutions: 0, exchanges: 0 };
	for (const [index, [players, options]] of (
		[
			[2, {}],
			[3, {}],
			[4, { fastBid: true }],
			[3, { kicker: true }],
			[5, { fastBid: true, kicker: true }],
		] as const
	).entries()) {
		const undoPoints = new Map<number, GameState>();
		const final = await play(await start(players, options, `undo-${index}`), undoPoints, { limit: 120 });
		const untouched = saved(final);
		for (const [to, expected] of undoPoints) {
			const restored = wrapper.replay(final, { to });
			assert.equal(wrapper.logLength(restored), to);
			assert.deepEqual(saved(restored), expected, `${players} players ${JSON.stringify(options)}: undo point ${to}`);
		}
		assert.deepEqual(saved(wrapper.replay(final)), untouched);
		assert.deepEqual(final, untouched, "replay leaves its input alone");
		covered.endedGames += final.ended ? 1 : 0;
		for (const entry of moveEntries(final)) {
			covered.autoPassed += entry.info?.autoPassed?.length ? 1 : 0;
			covered.automaticMega += entry.move.action === "mega" && (entry.player === 1 || entry.player === 2) ? 1 : 0;
			covered.sealedResolutions += entry.info?.winningBid !== undefined ? 1 : 0;
			covered.exchanges += entry.move.action === "exchange" ? 1 : 0;
		}
	}
	for (const [path, count] of Object.entries(covered)) {
		assert.ok(count > 0, `the simulated games no longer exercise ${path}`);
	}
});

test("a sealed bid revised in place is restored as its final version", async () => {
	const undoPoints = new Map<number, GameState>();
	let data = await play(await start(3, { fastBid: true }, "undo-revision"), undoPoints, {
		until: (state) =>
			state.phase === "auction" &&
			state.auction?.auctioneer !== HUMAN &&
			(state.auction?.bids?.[HUMAN] ?? 0) > 0 &&
			choiceRevision(state, HUMAN) !== undefined,
	});
	assert.ok(!data.ended, "the human placed a revisable sealed bid");
	const revisedAt = data.log.length;
	undoPoints.set(revisedAt, saved(data));
	data = await wrapper.move(data, { action: "bidPass", revision: choiceRevision(data, HUMAN) }, HUMAN);
	assert.equal(data.log.length, revisedAt);
	const afterRevision = saved(wrapper.messages(data).data);
	const final = await play(saved(afterRevision), undoPoints, { limit: 40 });
	for (const [to, expected] of undoPoints) {
		const restored = saved(wrapper.replay(final, { to }));
		if (to === revisedAt) {
			// The log keeps only the final choice, so the revision's own undo point shows it.
			assert.equal(restored.auction?.bids?.[HUMAN], 0);
			assert.deepEqual({ ...restored, liveUpdate: true }, afterRevision);
		} else {
			assert.deepEqual(restored, expected, `undo point ${to}`);
		}
	}
	assert.deepEqual(saved(wrapper.replay(final)), final);
});

test("automatic choices made under earlier settings are replayed as recorded", async () => {
	const undoPoints = new Map<number, GameState>();
	let data = await play(await start(3, {}, "undo-settings"), undoPoints, { limit: 90 });
	const automatic = moveEntries(data).filter(
		(entry) => entry.info?.autoPassed?.length || (entry.move.action === "mega" && entry.player === 1)
	);
	assert.ok(automatic.length > 0);
	for (const seat of [0, 1, 2]) {
		data = wrapper.setPlayerSettings(data, seat, { autoPassBids: false, autoMega: "ask" });
	}
	const final = await play(saved(data), undoPoints, { limit: 60 });
	for (const [to, expected] of undoPoints) {
		for (const [seat, player] of expected.players.entries()) {
			player.settings = final.players[seat]!.settings;
		}
		assert.deepEqual(saved(wrapper.replay(final, { to })), expected, `undo point ${to}`);
	}
});

test("entries recorded before newer log fields existed are kept as recorded", async () => {
	const undoPoints = new Map<number, GameState>();
	const data = await play(await start(3, {}, "undo-older"), undoPoints, { limit: 60 });
	const older = (state: GameState) => {
		for (const entry of state.log) {
			if (entry.type === "round") {
				delete entry.era;
				delete entry.megaGroups;
			}
		}
		return state;
	};
	const recorded = older(saved(data));
	for (const [to, expected] of undoPoints) {
		assert.deepEqual(saved(wrapper.replay(recorded, { to })), older(expected), `undo point ${to}`);
	}
});

test("names, settings and drops are not logged: the current ones are kept", async () => {
	const undoPoints = new Map<number, GameState>();
	let data = await play(await start(3, {}, "undo-kept"), undoPoints, { limit: 60 });
	data = wrapper.setPlayerMetaData(data, 1, { name: "Renamed" });
	data = wrapper.setPlayerSettings(data, HUMAN, { autoPassBids: false, autoMega: "singles" });
	data = saved(await wrapper.dropPlayer(data, 2));
	const [to, before] = [...undoPoints][2]!;
	const restored = wrapper.replay(saved(data), { to });

	const expected = structuredClone(before);
	expected.players[1]!.name = "Renamed";
	expected.players[HUMAN]!.settings = { autoPassBids: false, autoMega: "singles" };
	dropPlayer(expected, 2);
	expected.messages = [];
	assert.deepEqual(saved(restored), saved(expected));
	assert.deepEqual(wrapper.playerSettings(restored, HUMAN), { autoPassBids: false, autoMega: "singles" });
	assert.ok(restored.players[2]!.dropped && !restored.purchaseOrder.includes(2));
});

test("a history that cannot be reproduced is refused instead of rewritten", async () => {
	const undoPoints = new Map<number, GameState>();
	const data = await play(await start(3, {}, "undo-refused"), undoPoints, { limit: 80 });
	const roundIndex = data.log.findIndex((entry, index) => index > 1 && entry.type === "round");
	assert.ok(roundIndex > 0);
	assert.throws(() => wrapper.replay(data, { to: 0 }), /Invalid history position/);
	assert.deepEqual(wrapper.replay(data, { to: data.log.length + 5 }), wrapper.replay(data));

	const tampered = saved(data);
	const round = tampered.log[roundIndex] as Extract<LogEntry, { type: "round" }>;
	round.purchaseOrder.reverse();
	assert.throws(() => wrapper.replay(tampered), new RegExp(`cannot be reproduced from entry ${roundIndex}`));

	const truncated = saved(data);
	truncated.log.splice(roundIndex - 1, 1);
	assert.throws(() => wrapper.replay(truncated), /Cannot rebuild the game|cannot be reproduced/);

	// Drops are not logged: moves played after one no longer follow from the seed.
	const beforeDrop = await play(saved(data), undoPoints, {
		until: (state) => state.phase === "actions" && state.activeSeat === 2,
	});
	assert.ok(!beforeDrop.ended);
	const dropped = await play(saved(await wrapper.dropPlayer(beforeDrop, 2)), new Map(), { limit: 10 });
	assert.throws(() => wrapper.replay(saved(dropped)), /Cannot rebuild the game at log entry/);
	const [to, before] = [...undoPoints].at(-1)!;
	const expected = structuredClone(before);
	dropPlayer(expected, 2);
	assert.deepEqual(saved(wrapper.replay(saved(dropped), { to })), saved(expected));
});

test("a secret-stripped log, which has no seed, is still replayed for display", async () => {
	const data = await play(await start(3, { kicker: true }, "undo-stripped"), new Map(), { limit: 80 });
	const stripped = saved(wrapper.stripSecret(data, HUMAN));
	assert.deepEqual(wrapper.replay(saved(stripped), { to: 30 }), displayReplay(saved(stripped), { to: 30 }));
	assert.deepEqual(wrapper.replay(saved(stripped)), displayReplay(saved(stripped)));
});
