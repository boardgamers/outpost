import { FACTORIES, KICKER_SPECS, UPGRADE_SPECS } from "./data.js";
import type { GameState, LogEntry, MoveInfo } from "./types.js";

/** Display name of the card a move concerns (colony upgrade or Kicker card). */
function cardName(info: MoveInfo | undefined, fallback: string): string {
	if (info?.kicker) {
		return KICKER_SPECS[info.kicker].name;
	}
	if (info?.upgrade) {
		return UPGRADE_SPECS[info.upgrade].name;
	}
	return fallback;
}

function playerName(state: GameState, seat: number): string {
	return state.players[seat]?.name ?? `Player ${seat + 1}`;
}

/** Display name of a production resource key (ore → Ore, newChemicals → New Chemicals). */
function resourceName(t: string): string {
	const spaced = t.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Suffix naming the seats an auction auto-passed (they provably couldn't bid). */
function autoPassSuffix(state: GameState, info: MoveInfo | undefined): string {
	const seats = info?.autoPassed;
	if (!seats || seats.length === 0) {
		return "";
	}
	return ` — ${seats.map((s) => playerName(state, s)).join(", ")} auto-pass${seats.length === 1 ? "es" : ""} (can't reach the price)`;
}

export function describeLogEntry(state: GameState, entry: LogEntry, viewer?: number): string {
	switch (entry.type) {
		case "init":
			return `Game started with ${entry.players} players`;
		case "round": {
			const market = entry.market.map((u) => UPGRADE_SPECS[u].name).join(", ") || "empty";
			// eraBegan flags exactly the round the era advances; older logs lack
			// it and simply get no delimiter.
			const prefix = entry.eraBegan ? `Era ${["", "I", "II", "III"][entry.eraBegan]} begins — ` : "";
			return `${prefix}Round ${entry.round}: colony ship arrives: ${market}`;
		}
		case "end": {
			const scores = entry.scores.map((vp, seat) => `${playerName(state, seat)} ${vp} VP`).join(", ");
			return `Game over: ${scores}`;
		}
		case "move": {
			const name = playerName(state, entry.player);
			const move = entry.move;
			const info = entry.info;
			const sealed = state.options.fastBid === true;
			switch (move.action) {
				case "mega": {
					if (info?.megaSealed) {
						return `${name} locks in their production choice`;
					}
					const count = info?.mega ?? 0;
					return count > 0
						? `${name} takes ${count} mega production card${count === 1 ? "" : "s"}`
						: `${name} takes their production as single cards`;
				}
				case "discard":
					return `${name} discards ${info?.discarded ?? move.cards.length} card(s)`;
				case "auction":
					if ((sealed && entry.player !== viewer) || move.bid < 0) {
						return `${name} puts ${cardName(info, "an upgrade")} up for sealed auction`;
					}
					return (
						`${name} puts ${cardName(info, "an upgrade")} up for auction at ${move.bid}` +
						(sealed ? "" : autoPassSuffix(state, info))
					);
				case "bid": {
					if ((sealed && entry.player !== viewer) || move.amount < 0) {
						return `${name} takes part in the sealed auction`;
					}
					return `${name} bids ${move.amount}` + (sealed ? "" : autoPassSuffix(state, info));
				}
				case "bidPass":
					if (sealed && entry.player !== viewer) {
						return `${name} takes part in the sealed auction`;
					}
					return `${name} passes on the auction` + (sealed ? "" : autoPassSuffix(state, info));
				case "pay":
					return `${name} buys ${cardName(info, "the upgrade")} (paid ${info?.paid ?? 0})`;
				case "exchange": {
					const target = playerName(state, move.target);
					// The outcome is known the moment the exchange is offered (the
					// target hands back their lowest-higher card, or returns the
					// given card), so trade/decline shows at once. What stays
					// hidden until the exchange step ends is the received card's
					// VALUE: it is parked on the upgrade. -1 keeps neutral text.
					const given = info?.exchangeGiven;
					const givenText = given && given.v >= 0 ? `${resourceName(given.t)} ${given.v}` : "a card";
					const backText =
						(info?.exchangeValue ?? -1) >= 0
							? ` for ${given ? resourceName(given.t) : ""} ${info?.exchangeValue}`
							: " for a higher one";
					return info?.exchangeTake === -1
						? `${name} offers ${givenText} to ${target}, who has nothing higher to trade back`
						: `${name} trades ${givenText} with ${target}${backText}`;
				}
				case "exchangePass":
					return `${name} passes on the exchange`;
				case "endTurn": {
					const buys = (move.buys ?? []).map((buy) => {
						switch (buy.buy) {
							case "factory": {
								const count = buy.count ?? 1;
								return `builds ${count === 1 ? "a" : count} ${FACTORIES[buy.factory] ? buy.factory : "?"} factor${count === 1 ? "y" : "ies"}`;
							}
							case "population":
								return `recruits ${buy.count} colonist(s)`;
							case "robots":
								return `buys ${buy.count} robot(s)`;
						}
					});
					const mans = `mans ${move.manned.length} factor${move.manned.length === 1 ? "y" : "ies"}`;
					return buys.length > 0
						? `${name} ${buys.join(", ")} (paid ${info?.paid ?? 0}) and ${mans}`
						: `${name} ${mans}`;
				}
				default:
					return `${name} moves`;
			}
		}
		default:
			return "";
	}
}

export function describeLog(state: GameState, viewer?: number): string[] {
	return state.log.map((entry) => describeLogEntry(state, entry, viewer));
}
