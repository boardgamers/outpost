import { mount } from "svelte";
import App from "./App.svelte";
import { launchBridge } from "./lib/bgs.svelte";
import { createStore } from "./lib/store.svelte";
import type { Emitter } from "./lib/emitter";
import "./lib/theme.css";

export function launch(selector: string): Emitter {
	const target = document.querySelector(selector);
	if (!target) {
		throw new Error(`outpost-viewer: no element matches "${selector}"`);
	}

	const bridge = launchBridge();
	const store = createStore(bridge);

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
