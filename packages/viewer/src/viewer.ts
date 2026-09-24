import { installPlayerCards, createBoardThumbnail } from "./host-presentation";
import { mount, tick, unmount } from "svelte";
import { registerViewer } from "@boardgamers/protocol/viewer";
import type { GameState, Move } from "outpost-engine";
import { createActionSounds } from "./lib/sounds";
import App from "./App.svelte";
import { ViewerStore } from "./lib/store.svelte";
import { mountTutorial } from "./tutorial/mount";
import "./lib/theme.css";

registerViewer<GameState, Move>(
	"outpost",
	(commands) => {
		const store = new ViewerStore(commands);
		const sounds = createActionSounds();
		const app = mount(App, {
			target: commands.target,
			props: { store, onPlayerClick: commands.openPlayer },
		});
		const removeCards = installPlayerCards(commands.target, commands);
		const thumbnail = createBoardThumbnail(commands.target);
		return {
			chat: store.chat,
			async onThumbnail(size) {
				await tick();
				return thumbnail.render(commands.target.querySelector(".main"), size, "#0a1421", ".side");
			},
			async onState(state) {
				sounds.onState(state);
				store.setState(state);
				await tick();
			},
			onPlayer({ index }) {
				store.playerIndex = index;
			},
			onAvatars(avatars) {
				store.avatars = avatars;
			},
			onPreferences(preferences) {
				store.preferences = preferences;
				sounds.onPreferences(preferences);
			},
			onLog(log) {
				store.onGamelog(log);
			},
			onReplayStart() {
				sounds.onReplayStart();
				store.startReplay();
			},
			onReplayTo(to) {
				store.replayTo(to);
			},
			onReplayEnd() {
				sounds.onReplayEnd();
				store.endReplay();
			},
			destroy() {
				removeCards();
				thumbnail.destroy();
				store.destroy();
				sounds.destroy();
				void unmount(app);
			},
		};
	},
	{ tutorial: mountTutorial }
);

declare global {
	interface Window {
		outpost: ReturnType<typeof registerViewer<GameState, Move>>;
	}
}
