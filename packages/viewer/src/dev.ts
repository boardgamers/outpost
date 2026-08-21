import { startDevBackend } from "./dev-backend";
import { launch } from "./viewer";

const params = new URLSearchParams(window.location.search);
const players = Math.min(9, Math.max(2, Number(params.get("players") ?? 4)));
const seed = params.get("seed") ?? undefined;
const auto = params.get("auto") === "1" || params.get("auto") === "true";
const delayMs = params.get("delay") ? Number(params.get("delay")) : undefined;

const emitter = launch("#app");
startDevBackend(emitter as never, { players, seed, auto, delayMs });

(window as unknown as { outpostDev?: unknown }).outpostDev = {
	emitter,
	replayStart: () => emitter.emit("replay:start" as never),
	replayTo: (to: number) => emitter.emit("replay:to" as never, to as never),
	replayEnd: () => emitter.emit("replay:end" as never),
};

console.log(`[outpost dev] hot-seat vs bots: you are player 0 of ${players}, seed=${seed ?? "random"}`);
