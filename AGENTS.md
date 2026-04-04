# AGENTS.md — Närmast Vinner

A Swedish multiplayer geography-guessing game (inspired by "På Spåret") where players place pins on a world map to guess where historical events occurred. Built with Next.js 15, Supabase (Postgres + Realtime), and Leaflet.

## Architecture Overview

**Routes:**
- `/` — join a game (enter name + 6-char code)
- `/create` — create a game (choose mode/length/time)
- `/game/[code]` — the live game view for all players

**Core data flow:** All game state lives in Supabase. The `game/[code]/page.tsx` subscribes to three real-time Postgres change channels (`games`, `players`, `guesses`) and drives the entire UI reactively — no polling.

**Game phases (in `games.phase`):** `waiting` → `showing_image` → `guessing` → (back to `showing_image` for next round)

**Host identity:** The `host_id` in `games` is the player UUID also stored in `sessionStorage.playerId`. The host sees `GameControls.tsx`; everyone else does not. There is no auth — identity is purely `sessionStorage`-based.

## Key Files

| File | Purpose |
|---|---|
| `lib/database.types.ts` | Single source of truth for all table types — use these for `type X = Database['public']['Tables']['x']['Row']` |
| `lib/supabase.ts` | Singleton typed Supabase client (anon key, reads `NEXT_PUBLIC_*` env vars) |
| `lib/utils.ts` | `calculateDistance` (Haversine) and `generateGameCode` (6-char alphanumeric) |
| `lib/colors.ts` | Player color system — red is **reserved for the answer pin**; never assign red to players |
| `lib/events.ts` | Fallback `sampleEvents` array; only inserted if the `events` table is empty at game start |
| `supabase/schema.sql` | Full DB schema; incremental changes are in `supabase/migration_*.sql` files |

## Scoring Logic (Split Across Two Components)

- **`highscore` mode:** Points = `max(0, 1000 − distance_km)`. Awarded immediately in `MapComponent.tsx` on guess submit.
- **`closest_wins` mode:** Only the closest guesser gets +1 point. Awarded in `Results.tsx` when the results view is shown. Do not move this logic — it runs once per round thanks to the `scoringDone` guard.

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

```bash
npm run import-wiki   # interactive: prompts for Wikipedia URL, then saves to Supabase
```

The script (`scripts/import-wikipedia-event.ts`) fetches title, description, image, and coordinates from the Wikipedia REST + MediaWiki APIs and inserts directly into the `events` table using the hardcoded service-role key.

New event images must come from an allowed hostname. Add new domains to the `images.remotePatterns` array in `next.config.js`.

## Developer Commands

```bash
npm run dev        # start dev server
npm run build      # production build
npm run lint       # ESLint
npm run import-wiki  # add a Wikipedia event to the database
```

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

The import script has a hardcoded service-role key for direct DB writes. The app itself uses only the anon key.

## Conventions

- Types always derived from `Database` in `lib/database.types.ts`, not redefined inline.
- All Supabase calls go through the singleton from `lib/supabase.ts`.
- UI strings are in **Swedish**; error messages that surface to users must also be in Swedish.
- Tailwind utility classes used exclusively — no separate CSS modules. `globals.css` only defines the custom `sj-sans` font face.
- `touch-manipulation` class is added to all interactive buttons to prevent 300 ms tap delay on mobile.

