import { mountSoundTests } from "./lib/sounds";
import { startDevBackend } from "./dev-backend";
import "./viewer";

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

const emitter = window.outpost.launch("#app");
mountSoundTests((sound) => emitter.emit("preferences", { sound }));
startDevBackend(emitter, { players, seed, auto, delayMs, gameOptions });

(window as unknown as { outpostDev?: unknown }).outpostDev = {
	emitter,
	replayStart: () => emitter.emit("replay:start"),
	replayTo: (to: number) => emitter.emit("replay:to", to),
	replayEnd: () => emitter.emit("replay:end"),
	chatAppend: (author: string, text: string) =>
		emitter.emit("chat:appended", [{ _id: Date.now().toString(16).padStart(24, "0"), author, text, type: "text" }]),
	chatDisable: (disabled: boolean) => emitter.emit("chat:disabled", disabled),
	chatState: (canSend: boolean, reason?: string) =>
		emitter.emit("chat:state", { canSend, ...(reason ? { reason } : {}) }),
};

console.log(`[outpost dev] hot-seat vs bots: you are player 0 of ${players}, seed=${seed ?? "random"}`);

if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		window.outpost.destroy();
		Reflect.deleteProperty(window, "outpost");
	});
}
