# AGENTS.md — Närmast Vinner

A Swedish multiplayer geography-guessing game (inspired by "På Spåret") where players place pins on a world map to guess where historical events occurred. Built with Next.js 15, Supabase (Postgres + Realtime), and Leaflet.

## Architecture Overview

**Routes:**
- `/` — join a game (enter name + 6-char code)
- `/create` — create a game (choose mode/length/time)
- `/game/[code]` — the live game view for all players

**Core data flow:** All game state lives in Supabase. The `game/[code]/page.tsx` subscribes to three real-time Postgres change channels (`games`, `players`, `guesses`) and drives the entire UI reactively — no polling.

**Game phases (in `games.phase`):** `waiting` → `showing_image` → `guessing` → `revealing` → (back to `showing_image` for next round)

The reveal is a real server-side phase, not client state. Every client shows `Results.tsx` because `games.phase = 'revealing'` arrived over realtime, so everyone reveals simultaneously.

**Host identity:** The `host_id` in `games` is the player UUID also stored in `sessionStorage.playerId`. The host sees `GameControls.tsx`; everyone else does not. There is no auth — identity is purely `sessionStorage`-based.

If the host goes silent for 90 seconds the game is considered *stalled* and any player may advance it (`game_is_stalled()` in SQL, `STALL_MS` in `page.tsx`). This exists because a host closing their tab used to strand the game in `playing` forever.

## Key Files

| File | Purpose |
|---|---|
| `lib/database.types.ts` | Single source of truth for all table types — use these for `type X = Database['public']['Tables']['x']['Row']` |
| `lib/supabase.ts` | Singleton typed Supabase client (anon key, reads `NEXT_PUBLIC_*` env vars) |
| `lib/utils.ts` | `calculateDistance` (Haversine) and `generateGameCode` (6-char alphanumeric) |
| `lib/colors.ts` | Player color system — red is **reserved for the answer pin**; never assign red to players. Marker PNGs are self-hosted in `public/markers/` |
| `supabase/schema.sql` | Full DB schema; incremental changes are in `supabase/migration_*.sql` files |
| `supabase/migration_critical_fixes.sql` | The server-authoritative game logic. Read this before changing any game flow |

## Game State Is Server-Authoritative

**All game state transitions and all scoring live in Postgres**, as `SECURITY DEFINER`
functions called via `supabase.rpc()`. Do not move any of it back into React.

| RPC | Purpose |
|---|---|
| `start_game` | waiting → playing, picks first event |
| `begin_guessing` | showing_image → guessing, stamps `phase_started_at` |
| `submit_guess` | validates window/membership, computes distance, inserts guess |
| `close_round` | **awards points exactly once**, guessing → revealing |
| `advance_round` | picks next event, applies end conditions |
| `end_game` | marks finished |
| `set_player_color` | color change during lobby |

Why it matters:

- **Scoring runs exactly once per round.** `close_round` is guarded by the
  `round_results (game_id, round)` primary key, so it is safe for every client to
  call it concurrently. Scoring previously ran in `Results.tsx` on *every* client,
  which awarded the `closest_wins` winner 1–N points at random.
- **Distance is computed in Postgres** (`haversine_km`), never in the browser, so
  it cannot be forged.
- **The server owns the clock.** `submit_guess` and `close_round` both validate
  against `phase_started_at`, so a wrong device clock cannot buy extra time. The
  countdown in `page.tsx` is display only.
- **`anon` has no direct write access** to `games`, `players`, `guesses` or
  `events` (see `migration_critical_fixes_part_b.sql`). Only `INSERT` on
  `games`/`players` remains, for create/join. If you add a write, add an RPC.

RLS cannot express any of this on its own: there is no auth, so `auth.uid()` is
always `NULL` and a policy can only be `true` or `false`.

## Scoring Formulas

- **`highscore`:** `round(1000 * exp(−distance_km / 1000))` per player, per round.
- **`closest_wins`:** exactly +1 to the single closest guesser.

Both are implemented in `close_round()`. `lib/scoring.ts` mirrors them for display
only — **if you change one, change the other.** The database is authoritative.

The old linear `max(0, 1000 − km)` was replaced because, replayed over 5045 real
guesses, it scored 35% of them exactly zero: it had a hard cliff at 1000 km and
gave identical feedback to a guess 1100 km out and one 11000 km out.

## Solo Mode and Auto-Advance

`games.auto_advance` makes the **host's client** drive phase transitions on a
timer rather than by button press (`AUTO_IMAGE_MS` / `AUTO_REVEAL_MS` in
`page.tsx`). Only the host drives, so N players do not all fire the same
transition; if the host leaves, the 90s stall rescue takes over.

Solo games are ordinary games with one player, `auto_advance = true`, and
`startImmediately` in `lib/createGame.ts` — which calls `start_game` during
creation so the player never sees a lobby telling them to invite friends. There
is no separate solo code path, and `/create` and the solo button share
`createGame()` so they cannot drift.

The reveal countdown is server-synced: `close_round()` stamps `phase_started_at`
when it sets `phase = 'revealing'`.

## Leaflet / SSR Pattern

All Leaflet components **must** use `dynamic(..., { ssr: false })` or a `mounted` guard (`useState(false)` + `useEffect(() => setMounted(true), [])`). `MapComponent` and `Results` both follow this pattern. Also fix the default icon bug in every component that uses Leaflet:

```ts
import('leaflet').then((L) => {
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({ iconRetinaUrl: '...', iconUrl: '...', shadowUrl: '...' })
})
```

`reactStrictMode` is **disabled** in `next.config.js` specifically because of Leaflet initialization issues — do not re-enable it.

## Adding Events to the Database

> **There is currently no import tooling in the repo.** `AGENTS.md` used to
> document `npm run import-wiki` / `scripts/import-wikipedia-event.ts`, but
> neither exists — the script was removed and the npm script was never added.
> It survives only on the local `do-not-push` branch, where it also contains a
> hardcoded service-role key. See IMPROVEMENTS.md §7.1 before reinstating it,
> and read the key from `process.env`.

Events must be inserted with the **service-role key**; `anon` can no longer
write to `events`.

Requirements for a new row:

- `latitude` / `longitude` must be within valid ranges (enforced by CHECK constraints)
- `image_url` must be reachable, or the nightly keepalive job will set `image_ok = false`
  and `advance_round()` will stop picking it
- the image host must be in `images.remotePatterns` in `next.config.js`

`events.image_ok` is maintained by `.github/workflows/keepalive.yml`, which also
keeps the Supabase project from being paused for inactivity.

## Developer Commands

```bash
npm run dev        # start dev server
npm run build      # production build
npm run lint       # ESLint (note: no eslint config exists yet — see IMPROVEMENTS.md §4.5)
```

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

The app uses only the anon key. The keepalive workflow needs `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` as **GitHub repository secrets** — never commit them.

## Conventions

- Types always derived from `Database` in `lib/database.types.ts`, not redefined inline.
- All Supabase calls go through the singleton from `lib/supabase.ts`.
- UI strings are in **Swedish**; error messages that surface to users must also be in Swedish.
- Tailwind utility classes used exclusively — no separate CSS modules. `globals.css` only defines the custom `sj-sans` font face.
- `touch-manipulation` class is added to all interactive buttons to prevent 300 ms tap delay on mobile.

