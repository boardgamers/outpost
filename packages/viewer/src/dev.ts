import { startDevBackend } from "./dev-backend";
import { launch } from "./viewer";

const params = new URLSearchParams(window.location.search);
const players = Math.min(10, Math.max(2, Number(params.get("players") ?? 4)));
const seed = params.get("seed") ?? undefined;
const auto = params.get("auto") === "1" || params.get("auto") === "true";
const delayMs = params.get("delay") ? Number(params.get("delay")) : undefined;

const emitter = launch("#app");
startDevBackend(emitter as never, { players, seed, auto, delayMs });

// Dev-harness theme control: default to the system theme, and add a small
// toggle button that re-emits "theme" on the emitter exactly like the BGS shim
// does, so the viewer's light/dark switch is exercised end to end.
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
let dark = params.get("theme") ? params.get("theme") === "dark" : systemDark.matches;

function applyTheme(): void {
	emitter.emit("theme" as never, { dark } as never);
	toggle.textContent = dark ? "Light mode" : "Dark mode";
}

const toggle = document.createElement("button");
toggle.type = "button";
toggle.style.cssText =
	"position:fixed;bottom:12px;right:12px;z-index:1000;padding:6px 12px;border-radius:8px;border:1px solid #888;background:#fff;color:#222;font:13px system-ui;cursor:pointer;opacity:0.85";
toggle.addEventListener("click", () => {
	dark = !dark;
	applyTheme();
});
document.body.appendChild(toggle);

applyTheme();
systemDark.addEventListener("change", (e) => {
	dark = e.matches;
	applyTheme();
});

(window as unknown as { outpostDev?: unknown }).outpostDev = {
	emitter,
	replayStart: () => emitter.emit("replay:start" as never),
	replayTo: (to: number) => emitter.emit("replay:to" as never, to as never),
	replayEnd: () => emitter.emit("replay:end" as never),
	setTheme: (d: boolean) => {
		dark = d;
		applyTheme();
	},
};

console.log(`[outpost dev] hot-seat vs bots: you are player 0 of ${players}, seed=${seed ?? "random"}`);
