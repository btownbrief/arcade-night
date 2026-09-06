// Arcade Night — the phone page. Reads the night from the URL, lists tonight's
// games with deep links into the arcade, shows the countdown. Read-only.
import { decodeNight, nightCode, phase, countdown } from './core.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const DEMO = qs.get('demo') === '1';
const GAMES_URL = location.hostname === 'play.btownbrief.com' ? '/games.json' : 'https://play.btownbrief.com/games.json';

function demoNight() {
  const now = new Date(); now.setSeconds(0, 0);
  const start = new Date(now.getTime() - 20 * 60e3), end = new Date(now.getTime() + 70 * 60e3);
  return { name: 'Arcade Finals Night', sponsor: 'Demo Brewing Co.', games: ['maple-scramble', 'btown-hangman', 'flappy-champ', 'btown-riddle'], start: start.toISOString(), end: end.toISOString(), demo: true };
}

async function main() {
  const enc = qs.get('n');
  const cfg = DEMO ? demoNight() : decodeNight(enc);
  if (!cfg) { $('games').innerHTML = '<li class="muted">This link is missing its night. Scan the QR on the screen again.</li>'; $('clock').textContent = '—'; return; }
  $('code').textContent = DEMO ? 'DEMO' : nightCode(enc);
  $('title').innerHTML = esc(cfg.name).replace(/ (\S+)$/, ' <em>$1</em>');
  $('sponsor').textContent = cfg.sponsor ? `Presented by ${cfg.sponsor}` : '';
  let roster = {};
  try { const d = await (await fetch(GAMES_URL, { cache: 'no-cache' })).json(); for (const g of d.games || []) roster[g.slug] = g; } catch { /* still list slugs */ }
  $('games').innerHTML = cfg.games.map((slug) => {
    const g = roster[slug] || { name: slug.replace(/-/g, ' '), emoji: '🕹️', boardHint: '' };
    return `<li><span class="e">${g.emoji || '🕹️'}</span><span class="n"><b>${esc(g.name)}</b><small>${esc(g.boardHint || g.pitch || '')}</small></span><a class="go" href="https://play.btownbrief.com/${slug}/" target="_blank" rel="noopener">Play</a></li>`;
  }).join('');
  const tick = () => {
    const now = Date.now(); const ph = phase(cfg, now); const c = countdown(cfg, now);
    $('clock-lbl').textContent = ph === 'before' ? 'Starts in' : ph === 'over' ? 'Over' : 'Time left';
    $('clock').textContent = ph === 'over' ? 'Done' : c.text;
  };
  tick(); setInterval(tick, 1000);
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
main();
