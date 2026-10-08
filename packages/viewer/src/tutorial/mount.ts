import { mount, tick, unmount } from "svelte";
import { createTutorial, type TutorialMount } from "@boardgamers/protocol/tutorial";
import { mountTutorialGuide } from "@boardgamers/protocol/tutorial/dom";
import { stripSecret } from "outpost-engine/wrapper";
import type { GameState } from "outpost-engine";
import App from "../App.svelte";
import { ViewerStore } from "../lib/store.svelte";
import { lessons, type LessonAction } from "./lessons";
import "./tutorial.css";

export const mountTutorial: TutorialMount = async (target, { chapter, onProgress, nextChapter }) => {
	const lesson = lessons.find((entry) => entry.id === chapter);
	if (!lesson) {
		throw Error("Unknown Outpost chapter");
	}
	target.className = "outpost-tutorial";
	const top = document.createElement("div");
	top.className = "tutorial-top";
	const guide = document.createElement("div");
	const choices = document.createElement("div");
	choices.className = "tutorial-choices";
	choices.dataset.tutorial = "lesson-choices";
	choices.setAttribute("role", "group");
	choices.setAttribute("aria-label", "Lesson answers");
	const gameHost = document.createElement("div");
	top.append(guide, choices);
	target.append(top, gameHost);
	let destroyed = false;
	let animate = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let finishDelay: (() => void) | undefined;
	const store = new ViewerStore(
		{
			move(move) {
				void play({ kind: "move", move });
				return true;
			},
			openPlayer: () => false,
			hoverPlayer: () => false,
			leavePlayer: () => false,
			openBoardgame: () => false,
			updatePreference: () => false,
			updateSetting: () => false,
			fetchState: () => false,
			fetchLog: () => false,
			addLog: () => false,
			replaceLog: () => false,
			setReplayInfo: () => false,
			undo: () => false,
		},
		false
	);
	store.playerIndex = 0;
	store.preferences = { locale: target.lang };
	store.chat.setDisabled(true);
	let storage: Storage | undefined;
	try {
		storage = localStorage;
	} catch {
		storage = undefined;
	}
	const controller = await createTutorial({
		...lesson,
		storage,
		onProgress,
		async move(state, action) {
			const frames: GameState[] = [];
			const next = lesson.move(state, action, (frame) => frames.push(frame));
			if (animate) {
				for (const frame of frames) {
					if (destroyed) {
						break;
					}
					store.setState(stripSecret(frame, 0));
					await tick();
					await new Promise<void>((resolve) => {
						finishDelay = resolve;
						timer = setTimeout(resolve, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700);
					});
				}
			}
			finishDelay = undefined;
			return next;
		},
	});
	async function play(action: LessonAction) {
		if (destroyed || controller.snapshot.busy || controller.snapshot.completed) {
			return;
		}
		animate = true;
		try {
			await controller.play(action);
		} finally {
			animate = false;
		}
	}
	const app = mount(App, { target: gameHost, props: { store } });
	const unsubscribe = controller.subscribe((snapshot) => {
		if (!snapshot.busy) {
			store.turnBuys = [];
			store.setState(stripSecret(snapshot.state.game, 0));
		}
		const step = lesson.steps[snapshot.step]?.id ?? "complete";
		target.dataset.step = step;
		target.dataset.completed = String(snapshot.completed);
		gameHost.inert =
			snapshot.busy || snapshot.canContinue || snapshot.completed || !!lesson.choices?.[step] || !!lesson.watch?.[step];
		choices.replaceChildren();
		for (const choice of lesson.choices?.[step] ?? []) {
			const button = document.createElement("button");
			button.type = "button";
			button.textContent = choice.label;
			button.disabled = snapshot.busy;
			button.onclick = () => {
				void play({ kind: "answer", answer: choice.answer });
			};
			choices.append(button);
		}
		const watch = lesson.watch?.[step];
		if (watch) {
			const button = document.createElement("button");
			button.type = "button";
			button.textContent = watch;
			button.disabled = snapshot.busy;
			button.onclick = () => {
				void play({ kind: "watch" });
			};
			choices.append(button);
		}
		choices.hidden = !choices.childElementCount;
	});
	await tick();
	const cleanupGuide = mountTutorialGuide(guide, controller, { nextChapter });
	const resize = new ResizeObserver(() => {
		target.style.setProperty("--tutorial-height", `${top.getBoundingClientRect().height}px`);
	});
	resize.observe(top);
	return () => {
		destroyed = true;
		clearTimeout(timer);
		finishDelay?.();
		resize.disconnect();
		cleanupGuide();
		unsubscribe();
		controller.destroy();
		store.destroy();
		void unmount(app);
	};
};
