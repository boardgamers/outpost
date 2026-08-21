import { scores } from "./state.js";
import type { GameState } from "./types.js";

/** Final rankings: 1 is best. Dropped players rank below everyone still in the game. */
export function rankings(state: GameState): number[] {
	const finalScores = scores(state);
	const keyOf = (seat: number): number => {
		const player = state.players[seat];
		return player?.dropped ? -1 : (finalScores[seat] ?? 0);
	};
	return state.players.map((_, seat) => {
		const key = keyOf(seat);
		let rank = 1;
		for (let other = 0; other < state.players.length; other++) {
			if (other !== seat && keyOf(other) > key) {
				rank += 1;
			}
		}
		return rank;
	});
}
