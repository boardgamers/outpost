import { mount } from "svelte";
import App from "./App.svelte";
import { launchBridge } from "./lib/bgs.svelte";
import { createStore } from "./lib/store.svelte";
import type { Emitter } from "./lib/emitter";
import "./lib/theme.css";

// The BGS wrapper page sets <html class="dark"> for the initial paint, and the
// shim re-emits { dark } on the launch emitter as "theme" whenever the site
// theme changes. Light is the default (no `dark` class), so theme.css defines
// light tokens on :root and overrides them under html.dark.
function applyTheme(dark: boolean): void {
	document.documentElement.classList.toggle("dark", dark);
}

export function launch(selector: string): Emitter {
	const target = document.querySelector(selector);
	if (!target) {
		throw new Error(`outpost-viewer: no element matches "${selector}"`);
	}

	// Initial paint: the wrapper already set the class.
	applyTheme(document.documentElement.classList.contains("dark"));

	const bridge = launchBridge();
	const store = createStore(bridge);

	// Live theme changes via the emitter (shim re-emits the theme message).
	bridge.on("theme", ({ dark }) => applyTheme(dark));

	mount(App, {
		target,
		props: {
			store,
			onPlayerClick: (index: number) => bridge.playerClicked(index),
		},
	});
	console.log("[outpost] viewer mounted");

	// Emit ready only after the FIRST state has arrived and rendered — that's when
	// the game is actually shown. Emitting on mount (before state) makes the shim
	// post displayReady while the viewer still shows "Waiting for game state…",
	// and on a hard refresh that early displayReady can race ahead of the parent's
	// listener and get dropped, leaving the spinner up forever. A macrotask after
	// setState lets Svelte flush the DOM first (never rAF — hidden iframes skip it).
	let readySent = false;
	bridge.on("state", (s) => {
		console.log("[outpost] state received", { players: s?.players?.length, round: s?.round, readySent });
		if (readySent) {
			return;
		}
		readySent = true;
		setTimeout(() => {
			console.log("[outpost] emitting ready (after first state)");
			bridge.ready();
		}, 0);
	});
	return bridge.events as unknown as Emitter;
}

if (typeof window !== "undefined") {
	(window as unknown as { outpost?: unknown }).outpost = { launch };
}
