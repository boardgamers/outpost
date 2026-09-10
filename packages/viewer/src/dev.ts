import { mountSoundTests } from "./lib/sounds";
import { startDevBackend } from "./dev-backend";
import { launch } from "./viewer";

const params = new URLSearchParams(window.location.search);
const players = Math.min(9, Math.max(2, Number(params.get("players") ?? 4)));
const seed = params.get("seed") ?? undefined;
const auto = params.get("auto") === "1" || params.get("auto") === "true";
const delayMs = params.get("delay") ? Number(params.get("delay")) : undefined;
const fastBid = params.get("fastBid") === "1" || params.get("fastBid") === "true";
const kicker = params.get("kicker") === "1" || params.get("kicker") === "true";
const gameOptions: Record<string, unknown> = {};
if (fastBid) {
	gameOptions.fastBid = true;
}
if (kicker) {
	gameOptions.kicker = true;
}

const emitter = launch("#app");
mountSoundTests(emitter);
startDevBackend(emitter as never, { players, seed, auto, delayMs, gameOptions });

(window as unknown as { outpostDev?: unknown }).outpostDev = {
	emitter,
	replayStart: () => emitter.emit("replay:start" as never),
	replayTo: (to: number) => emitter.emit("replay:to" as never, to as never),
	replayEnd: () => emitter.emit("replay:end" as never),
	chatAppend: (author: string, text: string) =>
		emitter.emit("chat:appended" as never, [{ _id: `manual-${Date.now()}`, author, text, type: "text" }] as never),
	chatDisable: (disabled: boolean) => emitter.emit("chat:disabled" as never, disabled as never),
	chatState: (canSend: boolean, reason?: string) =>
		emitter.emit("chat:state" as never, { canSend, ...(reason ? { reason } : {}) } as never),
};

console.log(`[outpost dev] hot-seat vs bots: you are player 0 of ${players}, seed=${seed ?? "random"}`);
