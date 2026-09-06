// Arcade Night — pure rules. No DOM, no fetch, no Date.now(): time is an argument.
// A night is a config carried in the URL (no server): which games, when, what name.
// Scores come from the shared leaderboard spine as the games write them; this
// module decides what counts as "tonight" and who is Player of the Night.

export const APP = { name: 'Arcade Finals Night', slug: 'arcade-night', url: 'https://play.btownbrief.com/arcade-night/' };
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // same as Btown Party: no 0/O/1/I
export const RANK_POINTS = Object.freeze([10, 7, 5, 3, 2]);      // 1st..5th; anyone else who played gets 1
export const PLAYED_POINTS = 1;
export const MIN_GAMES = 1, MAX_GAMES = 6;
export const TZ = 'America/New_York';

// ---- night config ↔ URL ----
export function encodeNight(cfg) {
  const slim = { v: 1, n: String(cfg.name || '').slice(0, 60), g: cfg.games.slice(0, MAX_GAMES), s: cfg.start, e: cfg.end };
  if (cfg.sponsor) slim.p = String(cfg.sponsor).slice(0, 60);
  const json = JSON.stringify(slim);
  const bytes = new TextEncoder().encode(json);
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeNight(str) {
  try {
    const b64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const o = JSON.parse(new TextDecoder().decode(bytes));
    if (!o || o.v !== 1 || !Array.isArray(o.g) || !o.g.length || !o.s || !o.e) return null;
    const games = o.g.filter((s) => /^[a-z0-9-]{2,40}$/.test(String(s))).slice(0, MAX_GAMES);
    if (!games.length) return null;
    const start = Date.parse(o.s), end = Date.parse(o.e);
    if (!isFinite(start) || !isFinite(end) || end <= start) return null;
    return { name: String(o.n || 'Arcade Night').slice(0, 60), games, start: o.s, end: o.e, sponsor: o.p ? String(o.p).slice(0, 60) : '' };
  } catch { return null; }
}
export function validateNight(cfg) {
  if (!cfg.name || !cfg.name.trim()) return { ok: false, error: 'Give the night a name.' };
  if (!cfg.games || cfg.games.length < MIN_GAMES) return { ok: false, error: 'Pick at least one game.' };
  if (cfg.games.length > MAX_GAMES) return { ok: false, error: `Six games at most; ${cfg.games.length} is too many for one screen.` };
  const s = Date.parse(cfg.start), e = Date.parse(cfg.end);
  if (!isFinite(s) || !isFinite(e)) return { ok: false, error: 'Pick a start and an end.' };
  if (e <= s) return { ok: false, error: 'The end has to come after the start.' };
  if (e - s > 12 * 3600e3) return { ok: false, error: 'A night is under twelve hours.' };
  return { ok: true };
}
// A human-sized code for the poster, derived from the config so both pages agree.
export function nightCode(encoded) {
  let h = 2166136261;
  for (let i = 0; i < encoded.length; i++) { h ^= encoded.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  let out = '';
  for (let i = 0; i < 4; i++) { out += CODE_ALPHABET[h % CODE_ALPHABET.length]; h = (Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0); }
  return out;
}

// ---- time ----
export function monthKey(ts) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).formatToParts(new Date(ts));
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g('year')}-${g('month')}`;
}
export function phase(cfg, now) {
  const s = Date.parse(cfg.start), e = Date.parse(cfg.end);
  if (now < s) return 'before';
  if (now >= e) return 'over';
  return 'live';
}
export function countdown(cfg, now) {
  const target = phase(cfg, now) === 'before' ? Date.parse(cfg.start) : Date.parse(cfg.end);
  const ms = Math.max(0, target - now);
  const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3), s = Math.floor((ms % 60e3) / 1000);
  return { ms, text: h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}` };
}

// ---- what counts as tonight ----
// The spine keeps one row per (game, player, month): the player's monthly best,
// with updated_at. If the night RPC exists we get rows updated since the start.
// If not, we snapshot each board when the night opens and count anyone whose
// monthly best rose (or who appeared) since the snapshot. Same shape either way:
//   [{ player_id, name, score }]
export function tonightRows(baseline, current) {
  const base = new Map((baseline || []).map((r) => [r.player_id, r.score]));
  return (current || [])
    .filter((r) => !base.has(r.player_id) || r.score > base.get(r.player_id))
    .map((r) => ({ player_id: r.player_id, name: r.name, score: r.score }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
/** rows with a null score ("played, no new best") rank after every scored row */
export function sortTonight(rows) {
  return [...rows].sort((a, b) => (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score) || a.name.localeCompare(b.name));
}
export function applyHidden(rows, hidden) {
  const h = new Set((hidden || []).map((x) => String(x).toLowerCase()));
  return rows.filter((r) => !h.has(String(r.player_id).toLowerCase()) && !h.has(String(r.name).toLowerCase()));
}

// ---- Player of the Night ----
// Per game: 1st 10, 2nd 7, 3rd 5, 4th 3, 5th 2, everyone else who played 1.
// Sum across tonight's games. Ties: more games played, then more firsts, then name.
export function rankPointsFor(position) { return position < RANK_POINTS.length ? RANK_POINTS[position] : PLAYED_POINTS; }
export function playerOfTheNight(boards) { // boards: { slug: rows (already tonight-filtered, sorted; score null = played, no new best) }
  const tally = new Map();
  for (const [slug, rows] of Object.entries(boards)) {
    let scoredPos = 0;
    rows.forEach((r) => {
      const key = r.player_id || r.name;
      const t = tally.get(key) || { player_id: r.player_id, name: r.name, pts: 0, games: 0, firsts: 0, per: {} };
      const i = r.score == null ? RANK_POINTS.length : scoredPos++;
      const pts = rankPointsFor(i);
      t.pts += pts; t.games += 1; if (i === 0) t.firsts += 1; t.per[slug] = { rank: i + 1, pts, score: r.score };
      t.name = r.name; tally.set(key, t);
    });
  }
  return [...tally.values()].sort((a, b) => b.pts - a.pts || b.games - a.games || b.firsts - a.firsts || a.name.localeCompare(b.name));
}

// ---- the screen's rotation ----
export function rotation(games, { perGameMs = 12000, overallMs = 14000, howMs = 10000 } = {}) {
  const panels = games.map((g) => ({ kind: 'game', slug: g, ms: perGameMs }));
  panels.push({ kind: 'overall', ms: overallMs });
  panels.push({ kind: 'how', ms: howMs });
  return panels;
}

// ---- share ----
export function shareText(cfg, standings, gameNames) {
  const top = standings[0];
  const lines = [`🏆 ${cfg.name}${cfg.sponsor ? `, presented by ${cfg.sponsor}` : ''}`];
  if (top) lines.push(`Player of the Night: ${top.name} — ${top.pts} pts across ${top.games} game${top.games === 1 ? '' : 's'}`);
  const rest = standings.slice(1, 3).map((p, i) => `${i + 2}. ${p.name} (${p.pts})`);
  if (rest.length) lines.push(rest.join(' · '));
  for (const [slug, rows] of Object.entries(cfg.boards || {})) if (rows[0] && rows[0].score != null) lines.push(`${gameNames[slug] || slug}: ${rows[0].name} ${rows[0].score.toLocaleString('en-US')}`);
  lines.push('play.btownbrief.com');
  return lines.join('\n');
}
export function fmtScore(n) { return Number(n || 0).toLocaleString('en-US'); }
export function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
