import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseMove, moveAI } from "./ai.js";
import { initGame } from "./moves.js";
import { scores } from "./state.js";
import { currentPlayer } from "../wrapper.js";
import type { GameState } from "./types.js";

function playOut(state: GameState, maxMoves = 100000): GameState {
	for (let i = 0; i < maxMoves && !state.ended; i++) {
		const current = currentPlayer(state);
		const seat = Array.isArray(current) ? current[0] : current;
		assert.notEqual(seat, undefined, `no current player in phase ${state.phase}`);
		moveAI(state, seat as number);
	}
	return state;
}

test("AI plays a full 4-player game to completion", () => {
	const state = playOut(initGame(4, {}, "ai-4p"));
	assert.ok(state.ended);
	assert.ok(state.round <= 200);
	assert.ok(Math.max(...scores(state)) > 3, "somebody scored beyond the starting VP");
});

test("AI plays a full 2-player game to completion", () => {
	const state = playOut(initGame(2, {}, "ai-2p"));
	assert.ok(state.ended);
});

test("AI always proposes legal moves from any solicited state", () => {
	const state = initGame(5, {}, "ai-legal");
	for (let i = 0; i < 2000 && !state.ended; i++) {
		const current = currentPlayer(state);
		const seat = Array.isArray(current) ? current[0] : current;
		assert.notEqual(seat, undefined);
		// chooseMove must not throw and applyMove must accept it.
		const move = chooseMove(state, seat as number);
		moveAI(state, seat as number);
		assert.ok(move.action.length > 0);
	}
});
