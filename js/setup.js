// Arcade Night — host setup. Builds the night config, encodes it into the URL,
// draws the QR. Nothing is saved anywhere but this browser (the passphrase hash).
/* global qrcode */
import { encodeNight, validateNight, nightCode, MAX_GAMES } from './core.js';

const $ = (id) => document.getElementById(id);
const GAMES_URL = location.hostname === 'play.btownbrief.com' ? '/games.json' : 'https://play.btownbrief.com/games.json';
let games = []; const picked = new Set(['maple-scramble', 'btown-hangman', 'flappy-champ']);

function localIso(d) { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
function withOffset(local) { // datetime-local → ISO with the browser's offset, so the screen reads the same instant anywhere
  const d = new Date(local); const off = -d.getTimezoneOffset(); const s = off >= 0 ? '+' : '-'; const p = (n) => String(Math.abs(n)).padStart(2, '0');
  return `${local}:00${s}${p(Math.floor(off / 60))}:${p(off % 60)}`;
}
async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }

(function defaults() {
  const now = new Date(); now.setMinutes(0, 0, 0); now.setHours(now.getHours() + 1);
  $('start').value = localIso(now);
  const end = new Date(now.getTime() + 90 * 60e3); $('end').value = localIso(end);
})();

async function loadGames() {
  try {
    const res = await fetch(GAMES_URL, { cache: 'no-cache' });
    const data = await res.json();
    games = (data.games || []).filter((g) => g.live && g.leaderboard);
  } catch { games = []; }
  const box = $('games');
  if (!games.length) { box.innerHTML = '<span class="muted">Could not load games.json. Reload, or type slugs later.</span>'; return; }
  box.innerHTML = games.map((g) => `<button type="button" class="game-pick${picked.has(g.slug) ? ' on' : ''}" data-slug="${g.slug}"><span class="e">${g.emoji || '🕹️'}</span><span><b>${esc(g.name)}</b><small>${esc(g.boardHint || g.pitch || '')}</small></span></button>`).join('');
  box.querySelectorAll('.game-pick').forEach((b) => b.addEventListener('click', () => {
    const s = b.dataset.slug;
    if (picked.has(s)) picked.delete(s); else if (picked.size >= MAX_GAMES) { $('err').textContent = `Six games at most. Unpick one first.`; return; } else picked.add(s);
    b.classList.toggle('on', picked.has(s)); $('err').textContent = '';
  }));
}

$('setup').addEventListener('submit', async (e) => {
  e.preventDefault();
  const order = games.map((g) => g.slug).filter((s) => picked.has(s));
  const cfg = { name: $('name').value.trim(), sponsor: $('sponsor').value.trim(), games: order, start: withOffset($('start').value), end: withOffset($('end').value) };
  const v = validateNight(cfg);
  if (!v.ok) { $('err').textContent = v.error; return; }
  $('err').textContent = '';
  const enc = encodeNight(cfg);
  const code = nightCode(enc);
  const base = new URL('.', location.href).href;
  const screenUrl = `${base}screen.html?n=${enc}`;
  const phoneUrl = `${base}tonight.html?n=${enc}`;
  const pass = $('pass').value;
  try { localStorage.setItem(`an-host-${code}`, pass ? await sha(pass) : ''); } catch { /* private mode */ }
  $('code').textContent = code;
  $('when').textContent = `${new Date(cfg.start).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })} to ${new Date(cfg.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · ${cfg.games.length} game${cfg.games.length === 1 ? '' : 's'}`;
  const q = qrcode(0, 'M'); q.addData(phoneUrl); q.make();
  $('qr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  $('open-screen').href = screenUrl; $('open-phone').href = phoneUrl;
  $('link-screen').textContent = screenUrl; $('link-phone').textContent = phoneUrl;
  $('result').hidden = false; $('result').scrollIntoView({ behavior: 'smooth' });
});

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
loadGames();
