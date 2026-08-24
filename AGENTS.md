# AGENTS.md

Guidance for AI agents and contributors working in this repository.

## What this is

Unofficial open-source implementation of the board game Outpost (1991, James Hlavaty) for
boardgamers.space (BGS). Two packages: `packages/engine` (`outpost-engine`, rules + BGS
wrapper) and `packages/viewer` (`outpost-viewer`, Svelte 5 browser UI). See README.md for
the full picture, including the rules set implemented (Expert Rules v1.32) and the known
data deviations (some production deck distributions are inferred, not confirmed).

## Conventions

- **ESM everywhere**: `"type": "module"` in every package. TS imports use explicit `.js`
  extensions in the engine (`moduleResolution: nodenext`) and no extension in the viewer
  (`moduleResolution: bundler`) — follow the local pattern of each package.
- **Node >= 24** (`engines` field, `.nvmrc`), **pnpm 11** workspaces (`pnpm-workspace.yaml`).
- **TypeScript strict**, including `noUncheckedIndexedAccess`. Code must pass `pnpm tsc`
  (engine `tsc --noEmit`, viewer `svelte-check`) with zero errors.
- **No comments by default** — write self-explanatory code; comment only the non-obvious "why"
  (e.g. a BGS contract quirk, a rules edge case). No emojis in code or docs.
- **Formatting**: oxfmt (`.oxfmtrc.json`) — **tabs** for indentation (tabWidth 2),
  120-column lines, Svelte formatting enabled. Run `pnpm fmt` to format, `pnpm fmt:check`
  in CI. Linting: oxlint (`.oxlintrc.json`) with `curly: all` — always brace `if`/`for`/
  `while` bodies. Run `pnpm lint`.
- **Tests**: colocated `*.spec.ts` next to engine sources, run with `node --test` against
  compiled output (`pnpm --filter outpost-engine test` compiles to `dist-test/` first).
  Use `node:assert/strict`.
- **Dependencies**: pin exact versions; verify a version exists (`npm view <pkg> version`)
  before adding it. Keep the dependency list minimal.

## Engine specifics

- **In-place state mutation is intentional.** `applyMove` / `dropPlayer` mutate the passed
  `GameState` and return it, matching BGS/take6 engine semantics (the game-server
  JSON-serializes the state between calls). Illegal moves must throw **before any
  mutation** — validation runs first. Never mutate-then-throw.
- The game state must stay JSON-serializable at all times (no functions, no class
  instances, no Map/Set) because BGS round-trips it through `JSON.parse(JSON.stringify(...))`.
- All randomness goes through the seeded PRNG (`src/prng.ts`); the seed arrives via `init`.
  Never use `Math.random` in the engine — replay determinism depends on it. Randomness is
  drawn as `seedrandom(seed:counter)` with the counter stored in the state, so nothing
  needs to persist PRNG internals.
- **The wrapper boundary deep-validates untrusted input.** `wrapper.move` receives raw
  network JSON; `applyMove` runs `sanitizeMove` (`src/sanitize.ts`) which rebuilds the move
  as a fresh literal with only whitelisted fields, strict type checks and bounded arrays —
  this protects both interpretation and the log (moves are stored verbatim in `state.log`).
- **Hidden information**: `stripSecret` hides the seed (it derives all deck orders), deck
  values, other players' hand values (v = -1), and produced card values in round log
  entries. `logSlice` applies the same treatment. When writing features, never leak deck
  contents or opponents' card values into what a client can see.
- **Replay** (`src/replay.ts`) rebuilds state from the log without consuming randomness:
  "round" log entries carry purchase order, market, supply and production draws, and a
  `replayMode` flag (`src/moves.ts`) makes round transitions and affordability checks
  inert so a _stripped_ log replays into a stripped state.
- `packages/engine/wrapper.ts` is the BGS Engine API contract: keep the exported names and
  signatures in sync with the platform's `app/types/engine.ts`. `dist/wrapper.js` must
  exist after build (it is the registered `entryPoint`).
- Production deck data (`src/data.ts`) reproduces the published card counts; treat it as
  rules data, not creative content. See README.md "Data notes / deviations" before changing
  distributions.

## Viewer specifics

- **Svelte 5 runes mode only**: `$state`, `$derived`, `$props`, `$effect`. No legacy
  `export let`, no `$:` reactive statements.
- The viewer must keep working both inside the BGS iframe (postMessage bridge in
  `src/lib/bgs.svelte.ts`) and standalone (dev harness: `packages/viewer/index.html` +
  `src/dev.ts`). Uplink events are emitted on the emitter returned by `launch()` as well as
  posted to `window.parent`, so a local backend can subscribe the same way BGS does.
- Keep everything asset-free: cards and tokens are pure CSS. Theme tokens live in
  `src/lib/theme.css`.
- The BGS host measures `body.scrollHeight` — normal top-down document flow, no vertical
  centering tricks.
- `wrapper.currentPlayer` returns an **array** of seats during the simultaneous discard
  phase; the dev backend (and any future integration) must handle both shapes.

## Workflow

```bash
pnpm install
pnpm dev      # viewer dev server + mock backend harness
pnpm fmt      # oxfmt format (tabs, 120 cols)
pnpm lint     # oxlint (curly rule)
pnpm tsc      # engine tsc + viewer svelte-check
pnpm test     # engine tests
pnpm build    # engine dist/ + viewer dist/ (iife + css)
pnpm check    # fmt:check + lint + tsc + test + build
```

Run `pnpm check` before committing. Commit with clear messages; do not create PRs
(this repo has no remote).

## Deploying to BGS (prod)

Publishing goes through the BGS admin API with an admin token (`bgs_admin_...`,
sent as `Authorization: Bearer <token>`; only valid under `/api/admin/*` and the
token needs the `gameinfo` grant). Base URL: `https://admin.boardgamers.space/api`.
Never commit a token; take it from the environment (`$BGS_ADMIN_TOKEN`).

Outpost is registered as game `outpost`, version doc `1`, engine entryPoint
`dist/wrapper.js`. Ongoing games are pinned to the _game version integer_ but
hot-swap the _engine package_ on that doc, so re-uploading the engine upgrades
the running games within ~60 s (the game-server install cron). Upgrade the
engine and viewer together — the move format couples them.

```bash
AUTH="Authorization: Bearer $BGS_ADMIN_TOKEN"
BASE=https://admin.boardgamers.space/api/admin/gameinfo/outpost

# 0. Bump packages/engine/package.json version, then:
pnpm check && (cd packages/engine && pnpm pack)

# 1. Engine: raw npm-pack tgz body. Reads name/version from the tarball,
#    stores it on S3 and $sets engine.package (incl. url) on the doc itself.
curl -X POST "$BASE/1/engine" -H "$AUTH" \
	-H "Content-Type: application/octet-stream" \
	--data-binary @packages/engine/outpost-engine-<version>.tgz

# 2. Viewer files: each upload returns { url } (content-hashed, S3).
curl -X POST "$BASE/1/viewer/file?filename=outpost-viewer.iife.js" -H "$AUTH" \
	-H "Content-Type: application/octet-stream" \
	--data-binary @packages/viewer/dist/outpost-viewer.iife.js
curl -X POST "$BASE/1/viewer/file?filename=outpost-viewer.css" -H "$AUTH" \
	-H "Content-Type: application/octet-stream" \
	--data-binary @packages/viewer/dist/outpost-viewer.css

# 3. Persist the new viewer URLs: GET the doc, set viewer.url (and
#    viewer.dependencies.stylesheets if the css hash changed), drop
#    _id/createdAt/updatedAt/meta, PUT it back.
curl "$BASE/1" -H "$AUTH"           # read
curl -X PUT "$BASE/1" -H "$AUTH" -H "Content-Type: application/json" \
	--data-binary @gameinfo.json      # write

# 4. Verify: engine.package.version and viewer.url on the doc.
curl "$BASE/1" -H "$AUTH"
```

Step 1 alone is enough for an engine-only fix (no PUT needed). A brand-new game
version integer (`$BASE/2`) instead leaves ongoing games on the old code forever.
