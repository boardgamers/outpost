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

/**
 * fastBid keeps its moveset quiet while an auction collects sealed bids:
 * the opening, every bid and every pass of an unresolved auction all read
 * as a neutral "sealed auction in progress" — no amounts, no pass-vs-bid,
 * no auto-pass names. Once the resolving move is logged the real moves are
 * revealed (amounts, passes) by the wrapper's unmasking and described fully.
 */
function sealedQuiet(state: GameState): boolean {
	return state.phase === "auction" && state.auction?.bids !== undefined;
}

export function describeLogEntry(state: GameState, entry: LogEntry): string {
	switch (entry.type) {
		case "init":
			return `Game started with ${entry.players} players`;
		case "round": {
			const market = entry.market.map((u) => UPGRADE_SPECS[u].name).join(", ") || "empty";
			// Era change doubles as the delimiter: era I is the opening era, so a
			// round entry with era II/III is exactly where the new era starts.
			const era = entry.era ?? 1;
			const prefix = era > 1 ? `Era ${["", "I", "II", "III"][era]} begins — ` : "";
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
			switch (move.action) {
				case "mega": {
					const count = info?.mega ?? 0;
					return count > 0
						? `${name} takes ${count} mega production card${count === 1 ? "" : "s"}`
						: `${name} takes their production as single cards`;
				}
				case "discard":
					return `${name} discards ${info?.discarded ?? move.cards.length} card(s)`;
				case "auction":
					// fastBid: while the sealed bids are collected, the opening is
					// neutral for everyone (even the auctioneer — the amount is
					// sealed). After resolution the wrapper reveals the bid.
					if (sealedQuiet(state) || move.bid < 0) {
						return `${name} puts ${cardName(info, "an upgrade")} up for sealed auction`;
					}
					return (
						`${name} puts ${cardName(info, "an upgrade")} up for auction at ${move.bid}` + autoPassSuffix(state, info)
					);
				case "bid": {
					// fastBid: the resolving move carries the outcome in its info.
					if (info?.winningBid !== undefined) {
						const won = playerName(state, info.winner ?? entry.player);
						return `${name} bids ${move.amount} (sealed) — ${won} wins at ${info.winningBid === info.secondBid ? info.winningBid : Math.min((info.secondBid ?? 0) + 1, info.winningBid)}`;
					}
					if (sealedQuiet(state) || move.amount < 0) {
						return `${name} takes part in the sealed auction`;
					}
					return `${name} bids ${move.amount}` + autoPassSuffix(state, info);
				}
				case "bidPass":
					// fastBid: a pass can be the resolving move — it carries the outcome.
					if (info?.winningBid !== undefined) {
						const won = playerName(state, info.winner ?? entry.player);
						return `${name} passes — ${won} wins the sealed auction at ${info.winningBid === info.secondBid ? info.winningBid : Math.min((info.secondBid ?? 0) + 1, info.winningBid)}`;
					}
					if (sealedQuiet(state)) {
						return `${name} takes part in the sealed auction`;
					}
					return `${name} passes on the auction` + autoPassSuffix(state, info);
				case "pay":
					return `${name} buys ${cardName(info, "the upgrade")} (paid ${info?.paid ?? 0})`;
				case "exchange": {
					const target = playerName(state, move.target);
					// Card values are masked to -1 for non-participants until the
					// game ends (the wrapper hides them); -1 keeps the neutral text.
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
							case "factory":
								return `builds a ${FACTORIES[buy.factory] ? buy.factory : "?"} factory`;
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

export function describeLog(state: GameState): string[] {
	return state.log.map((entry) => describeLogEntry(state, entry));
}
