# Outpost

Unofficial open-source implementation of the board game **Outpost** (James Hlavaty, 1991)
for [boardgamers.space](https://boardgamers.space) (BGS). Not affiliated with TimJim or
Stronghold Games.

Two packages:

- **`packages/engine`** (`outpost-engine`) — pure TypeScript rules engine plus the BGS
  wrapper contract (`wrapper.ts`). Dependency-light (only `seedrandom`), deterministic via
  a seeded PRNG, state stays JSON-serializable at all times.
- **`packages/viewer`** (`outpost-viewer`) — Svelte 5 browser UI, built as a self-contained
  IIFE bundle for the BGS iframe (`window.outpost.launch(selector)`).

## Rules set

The engine implements the **20th Anniversary / Expert Rules v1.32** set, which is the
version Stronghold Games adopted as the base rules:

- Hand capacity 10 (research & microbiotics cards don't count against it)
- Research factories cost 30 and require a Laboratory; buying a New Chemicals factory
  requires spending a research card
- Over-capacity players discard **before** actions (after production)
- Robots don't count against the population limit; robot ownership is capped at
  (Robots upgrades × population)
- Victory: 75 VP (manned factories + upgrades); ties on VP in purchase order are broken
  by total credits spent
- Market refill via d4 / d10 / d12+1 depending on the leading VP, per the v1.32 setup chart

### Data notes / deviations

Production card distributions and averages follow the official reference sheet v1.32 and
owner-verified card counts (BGG thread 2801038). Water, titanium, new chemicals and orbital
medicine decks are confirmed card-by-card; the remaining decks (ore, research, microbiotics,
ring ore, moon ore) use symmetric bell distributions matching the confirmed deck sizes and
official average values, since exact value splits were not available. The original edition's
physical decks differ in a few counts (e.g. only two "4" water cards).

- In-game randomness (deck shuffles, die rolls, tie-breaks) is fully deterministic from the
  game seed; BGS supplies the seed, so replays and save/load are exact.
- Random VP tie-breaks in purchase order are resolved by seat order (never relevant online).
- Auction winners receive no change when overpaying, per the rules.
- Mega production cards (expert rule 12.1: trade 4 water/titanium/new-chemicals draws for a
  fixed-value Mega card) are not implemented: the printed Mega Titanium value could not be
  confirmed from any text source (Mega Water = 30 and Mega New Chemicals = 88 are known).
  Production always draws one card per manned factory.

## Development

```bash
pnpm install
pnpm dev      # viewer dev server + mock backend harness (human + bots)
pnpm check    # fmt:check + lint + tsc + test + build
```

Dev harness URL params: `?players=4&seed=xyz&delay=700&auto=1`.

Node >= 24, pnpm 11 (see `packageManager`). All dependencies pinned.

## Deploying to BGS

- Engine: `npm pack` the built `outpost-engine` (or publish) and register it as the game
  engine in the BGS admin panel; entry point `dist/wrapper.js`.
- Viewer: upload `packages/viewer/dist/outpost-viewer.iife.js` + `outpost-viewer.css`
  (and the `.map` with a shared bundle id if you want devtools sourcemaps).

See <https://docs.boardgamers.space/guide/adding-a-game>.

## License

AGPL-3.0.
