# Arcade Finals Night — agent notes

Read `README.md` first. Stephen is non-technical — explain consequential changes
in plain language. Plain static site, no build step, ES modules. Unlisted (not in
games.json or the hub): it is a tool for one night, not a game.

## Rules that will trip you up

- **Read-only against the spine, always.** This app never calls `submit_score`
  or anything that writes. If a feature seems to need a write, it belongs in the
  games, not here.
- **The night lives in the URL.** `encodeNight`/`decodeNight` in `js/core.js`
  carry the whole config (name, games, start, end, sponsor) as base64url JSON in
  `?n=`. There is no server and no database for nights. `nightCode` is a hash of
  that string, so the screen and the phone page agree without talking.
- **`js/core.js` is pure**: no DOM, no fetch, no `Date.now()`. Time is an
  argument. Add a case to `scripts/test-core.mjs` for any rule change,
  especially `RANK_POINTS` and the tie-break order.
- **Two read paths, keep both.** `get_night_board` (not yet in the spine; SQL in
  `supabase/arcade-night-READ.sql`) and the baseline-diff fallback over
  `get_leaderboard`. The fallback must keep working forever; the RPC is an
  upgrade. Never let the screen error-state: no RPC → say so in the footer, keep
  rotating.
- **Hidden names are local.** The host panel's list and passphrase hash live in
  the laptop's localStorage under `an-hidden-<code>` / `an-host-<code>`. Do not
  move them server-side.
- **The screen is for a wall.** 1920×1080, dark, type sized to read from the bar.
  Keep the rotation to one thing at a time; put new facets in a new panel, not
  in a sidebar.
- **Demo must stay complete.** `?demo=1` uses `createFakeSpine` and streams
  scores; `&mins=N` shortens the clock so the finale can be rehearsed.

## Before you finish

```
node --test scripts/test-core.mjs
for f in js/*.js; do node --check "$f"; done
```
Then open `screen.html?demo=1&mins=2` at 1920×1080 (rotate, host panel with
passphrase `demo`, finale) and `tonight.html?demo=1` at a phone width.
