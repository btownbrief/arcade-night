// Arcade Night — reading the shared leaderboard spine (the same Supabase project
// and public RPCs every game's leaderboard.js already uses). Read-only: this app
// never submits a score; players play the games on their phones and the games
// write to the spine as they always do.
//
// Two read paths, tried in order:
//   1. get_night_board(p_game, p_since)  — rows updated since the night began.
//      Not in the spine yet: the SQL to add it is in supabase/arcade-night-READ.sql.
//   2. get_leaderboard(p_game, p_month)  — the monthly top 100, which IS in the
//      spine. The screen snapshots each board when the night opens (localStorage)
//      and counts anyone whose monthly best rose, or who appeared, since then.
//      Limitation, stated on the screen: a player who plays tonight but does not
//      beat their own monthly best is invisible to this path.
import { monthKey, tonightRows } from './core.js';

export const SUPABASE_URL = 'https://jnouvwxomrcffqwilqkq.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_RkMJQopffWlV6DSwCRkndQ_Xw6GJMf3';

async function rpc(fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  });
  if (res.status === 404) { const e = new Error('not_ready'); e.code = 'not_ready'; throw e; }
  if (!res.ok) { const e = new Error(`server ${res.status}`); e.code = 'server'; throw e; }
  return res.json();
}

export function createSpine({ storage = null } = {}) {
  let nightRpc = null; // null = untested, true = exists, false = 404
  const baselines = new Map();
  const key = (night, slug) => `an-base-${night}-${slug}`;

  function loadBaseline(night, slug) {
    if (baselines.has(slug)) return baselines.get(slug);
    try { const raw = storage?.getItem(key(night, slug)); if (raw) { const b = JSON.parse(raw); baselines.set(slug, b); return b; } } catch { /* ignore */ }
    return null;
  }
  function saveBaseline(night, slug, rows) {
    baselines.set(slug, rows);
    try { storage?.setItem(key(night, slug), JSON.stringify(rows)); } catch { /* ignore */ }
  }

  return {
    mode: () => (nightRpc ? 'window' : 'baseline'),
    /** rows that count as tonight for one game: [{player_id, name, score}] sorted desc */
    async tonight(night, slug, sinceIso, now) {
      if (nightRpc !== false) {
        try {
          const rows = await rpc('get_night_board', { p_game: slug, p_since: sinceIso });
          nightRpc = true;
          return (rows || []).map((r) => ({ player_id: r.player_id, name: r.name, score: r.score })).sort((a, b) => b.score - a.score);
        } catch (e) { if (e.code !== 'not_ready') throw e; nightRpc = false; }
      }
      const current = (await rpc('get_leaderboard', { p_game: slug, p_month: monthKey(now) })) || [];
      let base = loadBaseline(night, slug);
      if (!base) { base = current; saveBaseline(night, slug, base); }
      return tonightRows(base, current);
    },
    /** the plain monthly board (for the "how it usually looks" fallback) */
    async monthly(slug, now) { return (await rpc('get_leaderboard', { p_game: slug, p_month: monthKey(now) })) || []; },
    resetBaselines(night, slugs) { for (const s of slugs) { baselines.delete(s); try { storage?.removeItem(key(night, s)); } catch { /* ignore */ } } },
  };
}

// ---- demo: a fake spine that streams scores in while you rehearse ----
const DEMO_NAMES = ['Bike Path Pete', 'Creemee Queen', 'Onion City Otis', 'Battery Park Bea', 'North St Nora', 'Catamount Cal', 'Pine St Pablo', 'Shore Rd Shay', 'Lakeside Lou', 'Intervale Ivy', 'Church St Chuck', 'Dorset St Dee', 'Maple Maya', 'Sam K', 'Flatlander Fran'];
export function createFakeSpine({ games, seed = 5, startedAt }) {
  let s = seed; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const boards = new Map(games.map((g) => [g, []]));
  const ids = DEMO_NAMES.map((n, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  const scale = (slug) => (/scramble/.test(slug) ? 36000 : /hangman/.test(slug) ? 40000 : /riddle|wordle/.test(slug) ? 12 : 5000);
  function bump(n = 1) {
    for (let k = 0; k < n; k++) {
      const slug = games[Math.floor(rnd() * games.length)]; const i = Math.floor(rnd() * ids.length);
      const rows = boards.get(slug); const cur = rows.find((r) => r.player_id === ids[i]);
      const score = Math.round(scale(slug) * (0.35 + rnd() * 0.65));
      if (!cur) rows.push({ player_id: ids[i], name: DEMO_NAMES[i], score, at: Date.now() });
      else if (score > cur.score) { cur.score = score; cur.at = Date.now(); }
    }
  }
  bump(18);
  return {
    mode: () => 'demo',
    tick() { if (rnd() < 0.7) bump(1); },
    async tonight(night, slug) { return [...(boards.get(slug) || [])].sort((a, b) => b.score - a.score).map(({ player_id, name, score }) => ({ player_id, name, score })); },
    async monthly(slug) { return this.tonight(null, slug); },
    resetBaselines() {},
    startedAt,
  };
}
