# Arcade Finals Night 🏆

**The big-screen scoreboard for a night of playing Btown games together.** Pick
tonight's games, get a code and a QR, put the screen on the bar TV. People scan
the code, play the games on their own phones the normal way, and their best
scores of the night land on the wall. At the end the screen becomes the trophy.

**Unlisted.** Concept #18 in the arcade slate; the run sheet, copy and poster are
in `advisor/research/arcade-kit-2026-09/04-arcade-finals-night/`.

- Setup: https://play.btownbrief.com/arcade-night/
- Rehearse: https://play.btownbrief.com/arcade-night/screen.html?demo=1 (fake scores stream in) and https://play.btownbrief.com/arcade-night/tonight.html?demo=1

A [Btown Brief](https://www.btownbrief.com) game.

## The five-line host recipe

1. **Laptop to the TV.** HDMI cable into the bar's TV (USB-C to HDMI adapter for a MacBook), or AirPlay from a Mac to an Apple TV. Switch the TV to that input. Bring your own HDMI cable and a phone hotspot.
2. **Make the night** at play.btownbrief.com/arcade-night/: name, start, end, three to six games, a passphrase. Open the screen link on the laptop, press **F** for fullscreen. It rotates by itself.
3. **Put the QR up.** It is on the screen every rotation and on the setup page; print it on the table cards. Say: scan it, pick a game, play on your phone.
4. **Let it run.** Scores land as people play. Press **H** for the host panel (hide a name, reveal early), arrows to skip panels, **Space** to reveal or go back.
5. **The finale.** When the clock hits zero the trophy screen comes up on its own. Photograph the winner with the screen behind them; the share line is on the screen.

## How it scores

Every game on the night keeps its own board of tonight's scores. Each board pays
**10 · 7 · 5 · 3 · 2** to the top five and **1** to anyone who played. Sum across
the games and the biggest number is **Player of the Night**. Ties: more games
played, then more boards won, then name. (`playerOfTheNight` in `js/core.js`.)

## Where the scores come from, and what the wall cannot know

Nothing here writes anything. The games write to the shared arcade leaderboard
spine as they always do (`maple-scramble/supabase/schema.sql`). Two facts about
that spine decide what this screen can honestly claim:

- It keeps **one row per game, player and month**: the player's monthly best.
- `submit_score` sets `updated_at = now()` on **every** submission, even a worse
  one. So a timestamp inside the night means "submitted tonight", not "this score
  was achieved tonight".

What the screen does with that:

1. **Scores, the snapshot rule.** When the night opens the screen snapshots each
   monthly board (laptop localStorage). A player counts with a score only if their
   monthly best rose, or they appeared, since then. That is the only signal that a
   score was achieved tonight.
2. **Attendance, optional.** `get_night_board(p_game, p_since, p_until)` in
   `supabase/arcade-night-READ.sql` lists who submitted inside the night's window
   (hard-bounded by the end time). Players in that list without a risen best show
   as "played · no new best" and get the 1-point participation mark, never a score.
   Paste it once if you want that line; the screen works without it.
3. **Hard end.** Reads stop at the end time and the trophy freezes there.

What it cannot do, and says so in its footer: score a play that did not beat the
player's own monthly best, or prove who is in the room. The spine has no channel
for a night token (`submit_score` takes game, player, token, name and score, and
the name is set inside each game, not by the phone page), so "only people who
scanned the QR" is not enforceable without changing every game. Treat the wall
as the evening's story, not a court of record; the T9 run sheet already says the
final is played live on the projector and the boards are only the invitation.

## Names, hiding, privacy

Names are whatever players already use in the games (device-token identity, no
accounts). The host panel can hide a name from the wall; it is a local list in the
laptop's browser gated by a passphrase set at setup (hashed into localStorage,
never sent anywhere). Nothing about the night is stored on any server: the night
itself is the link.

## Repo

```
index.html      setup: games from /games.json, dates, passphrase → code + QR + links
screen.html     the 1920×1080 screen (rotation, countdown, how-to + QR, finale, host panel)
tonight.html    the phone page: tonight's games with deep links, the countdown
js/core.js      pure: night ↔ URL, code, phase/countdown, tonight filter, Player of the Night, share text
js/spine.js     read-only spine client (night RPC → baseline fallback) + the demo's fake spine
js/setup.js  js/screen.js  js/tonight.js
supabase/arcade-night-READ.sql   the one read RPC to paste
vendor/qrcode.min.js             qrcode-generator 1.4.4 (MIT), vendored
scripts/test-core.mjs            node --test
```

No build step. Same shell as the other games: GoatCounter, ticker on the portrait
pages, manifest, icons, `checks.yml` + `deploy.yml`.

## Verify

```
node --test scripts/test-core.mjs
for f in js/*.js; do node --check "$f"; done
```
Then open `screen.html?demo=1&mins=2` at 1920×1080 and watch it rotate, hide a
name from the host panel (passphrase `demo`), and let the clock run out.
