import { applyMove, chooseMove, initGame, type GameState, type Move } from "outpost-engine";
import { currentPlayer, stripSecret } from "outpost-engine/wrapper.js";

export interface DevOptions {
	players?: number;
	seed?: string;
	delayMs?: number;
	/* When true, the human seat also auto-plays — the whole game plays itself
   out (handy for reaching the end screen in dev). */
	auto?: boolean;
}

const NAMES = [
	"You",
	"Ada (bot)",
	"Cleo (bot)",
	"Dora (bot)",
	"Ezra (bot)",
	"Faye (bot)",
	"Gus (bot)",
	"Hana (bot)",
	"Ivan (bot)",
	"Juno (bot)",
];
const AVATARS = [
	"",
	"https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Ada&backgroundColor=ffdfbf",
	"https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Cleo&backgroundColor=b6e3f4",
	"https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Dora&backgroundColor=c0aede",
	"https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Ezra&backgroundColor=d1d4f9",
	"https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Faye&backgroundColor=ffd5dc",
	"https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Gus&backgroundColor=c0f0c0",
	"https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Hana&backgroundColor=ffe8b6",
	"https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Ivan&backgroundColor=b6e3f4",
	"https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Juno&backgroundColor=e8c0f0",
];

export function startDevBackend(
	emitter: {
		emit: (event: string, payload?: unknown) => void;
		on: (event: string, fn: (payload: never) => void) => void;
	},
	options: DevOptions = {}
): void {
	const playerCount = options.players ?? 4;
	const seed = options.seed ?? `dev-${Math.floor(Math.random() * 1e6)}`;
	const delay = options.delayMs ?? 700;

	let state: GameState = initGame(playerCount, {}, seed);
	for (let i = 0; i < playerCount; i++) {
		state.players[i]!.name = NAMES[i] ?? `Player ${i + 1}`;
	}
	state.messages = [];

	const human = 0;
	let ended = false;

	function publish(): void {
		emitter.emit("state", stripSecret(state, human));
		emitter.emit("player", { index: human });
		emitter.emit("avatars", AVATARS.slice(0, playerCount));
		if (state.ended && !ended) {
			ended = true;
			return;
		}
		scheduleBots();
	}

	function scheduleBots(): void {
		if (state.ended) {
			return;
		}
		// currentPlayer is an ARRAY of seats during the simultaneous discard
		// phase — every bot in it may move (one per delay tick), and the loop
		// must stop and wait if the human is among them.
		const current = currentPlayer(state);
		const seats = Array.isArray(current) ? current : current === undefined ? [] : [current];
		const seat = seats.find((s) => s !== human || options.auto);
		if (seat === undefined) {
			return;
		}
		window.setTimeout(() => {
			if (state.ended) {
				return;
			}
			try {
				state = applyMove(state, chooseMove(state, seat), seat);
			} catch (error) {
				console.error("[dev-backend] bot move failed", error);
				return;
			}
			publish();
		}, delay);
	}

	emitter.on("move", ((move: Move) => {
		if (state.ended) {
			return;
		}
		try {
			state = applyMove(state, move, human);
		} catch (error) {
			console.error("[dev-backend] illegal move", error);
			publish();
			return;
		}
		publish();
	}) as never);

	emitter.on("fetchState", (() => publish()) as never);

	window.setTimeout(publish, 50);
}
