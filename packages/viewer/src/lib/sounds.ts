import type { GameState } from "outpost-engine";
type Note = [number, number, number, number, number?];
type Cue = { label: string; notes: Note[] };
export const soundCues: Record<string, Cue> = {
	production: {
		label: "Production",
		notes: [
			[0, 0.3, 70, 0.12, 40],
			[0.08, 0.18, 0, 0.08, 700],
			[0.22, 0.3, 180, 0.06, 260],
		],
	},
	build: {
		label: "Factory / upgrade",
		notes: [
			[0, 0.12, 0, 0.15, 800],
			[0.08, 0.17, 120, 0.12, 60],
			[0.2, 0.13, 0, 0.06, 1400],
		],
	},
	bid: { label: "Auction bid", notes: [[0, 0.09, 460, 0.07, 600]] },
	trade: {
		label: "Payment / exchange",
		notes: [
			[0, 0.12, 1100, 0.06, 700],
			[0.1, 0.14, 1500, 0.05, 1000],
		],
	},
	era: {
		label: "New era",
		notes: [
			[0, 0.4, 180, 0.08],
			[0.12, 0.45, 270, 0.07],
			[0.25, 0.5, 360, 0.06],
		],
	},
};
let context: AudioContext | undefined;
let enabled = true;
export function setSoundEnabled(value: boolean): void {
	enabled = value;
}
export function playSound(name: string): void {
	if (!enabled || !soundCues[name] || typeof window === "undefined") {
		return;
	}
	if (typeof navigator !== "undefined") {
		const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
		if (activation && !activation.hasBeenActive) {
			return;
		}
	}
	const Audio = window.AudioContext;
	if (!Audio) {
		return;
	}
	context = context || new Audio();
	const ctx = context;
	void ctx
		.resume()
		.then(() => {
			if (!enabled || ctx.state !== "running") {
				return;
			}
			for (const [offset, duration, frequency, volume, endFrequency] of soundCues[name]!.notes) {
				const start = ctx.currentTime + offset;
				const gain = ctx.createGain();
				gain.gain.setValueAtTime(0.0001, start);
				gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
				gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
				gain.connect(ctx.destination);
				if (frequency === 0) {
					const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
					const samples = buffer.getChannelData(0);
					for (let i = 0; i < samples.length; i++) {
						samples[i] = Math.random() * 2 - 1;
					}
					const source = ctx.createBufferSource();
					source.buffer = buffer;
					const filter = ctx.createBiquadFilter();
					filter.type = "lowpass";
					filter.frequency.value = endFrequency || 900;
					source.connect(filter);
					filter.connect(gain);
					source.start(start);
					source.stop(start + duration);
				} else {
					const oscillator = ctx.createOscillator();
					oscillator.type = "sine";
					oscillator.frequency.setValueAtTime(frequency, start);
					oscillator.frequency.exponentialRampToValueAtTime(endFrequency || frequency, start + duration);
					oscillator.connect(gain);
					oscillator.start(start);
					oscillator.stop(start + duration);
				}
			}
		})
		.catch(() => undefined);
}

export function createActionSounds() {
	let previous: string[] | undefined;
	let replaying = false;
	return {
		onPreferences(prefs: Record<string, unknown>) {
			setSoundEnabled(prefs.sound !== false);
		},
		onReplayStart() {
			replaying = true;
		},
		onReplayEnd() {
			replaying = false;
			previous = undefined;
		},
		onState(state: GameState) {
			const entries = state.log;
			const next = entries.map((entry) => JSON.stringify(entry));
			const extendsHistory =
				previous && previous.length < next.length && previous.every((entry, i) => entry === next[i]);
			const from = previous?.length ?? 0;
			previous = next;
			if (!extendsHistory || replaying) {
				return;
			}
			const cues = entries.slice(from).map(cueForEntry).filter(Boolean);
			const cue = cues[cues.length - 1];
			if (cue) {
				playSound(cue);
			}
		},
		destroy() {
			if (context) {
				void context.close();
				context = undefined;
			}
		},
	};
}

export function mountSoundTests(
	onPreferenceChange: (sound: boolean) => void,
	onColonyPreferenceChange?: (visible: boolean) => void
): void {
	const panel = document.createElement("details");
	panel.style.cssText =
		"position:relative;z-index:5;padding:10px 16px;margin:8px;background:#172638;color:#f0f4f8;border:1px solid #56718a;border-radius:8px;font:14px system-ui";
	const summary = document.createElement("summary");
	summary.textContent = "Playtest tools · preferences and sounds";
	panel.append(summary);
	const label = document.createElement("label");
	label.style.margin = "10px";
	const toggle = document.createElement("input");
	toggle.type = "checkbox";
	toggle.checked = true;
	toggle.onchange = () => {
		setSoundEnabled(toggle.checked);
		onPreferenceChange(toggle.checked);
	};
	label.append(toggle, " Game sounds");
	panel.append(label);
	for (const [name, cue] of Object.entries(soundCues)) {
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = cue.label;
		button.style.cssText =
			"margin:8px 4px;padding:7px 12px;color:#f0f4f8;background:#294663;border:1px solid #7391ad;border-radius:5px;cursor:pointer";
		button.onclick = () => playSound(name);
		panel.append(button);
	}
	if (onColonyPreferenceChange) {
		const colonyLabel = document.createElement("label");
		colonyLabel.style.margin = "10px";
		const colonyToggle = document.createElement("input");
		colonyToggle.type = "checkbox";
		colonyToggle.checked = true;
		try {
			colonyToggle.checked = localStorage.getItem("outpost.showColony") !== "false";
		} catch {}
		colonyToggle.onchange = () => {
			try {
				localStorage.setItem("outpost.showColony", String(colonyToggle.checked));
			} catch {}
			onColonyPreferenceChange(colonyToggle.checked);
		};
		colonyLabel.append(colonyToggle, " Show colony surface");
		panel.append(colonyLabel);
		onColonyPreferenceChange(colonyToggle.checked);
	}
	document.body.prepend(panel);
}
function cueForEntry(entry: any): string | undefined {
	if (entry.type === "round") {
		return entry.eraBegan ? "era" : "production";
	}
	const move = entry.move;
	if (!move) {
		return undefined;
	}
	if (move.action === "endTurn") {
		return move.buys?.length ? "build" : undefined;
	}
	return (
		{ auction: "bid", bid: "bid", pay: "trade", exchange: "trade", mega: "production" } as Record<string, string>
	)[move.action];
}
