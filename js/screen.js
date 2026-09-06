// Arcade Night — the big screen. Rotates tonight's boards, the overall standings
// and the how-to-play panel; counts down; flips to the trophy at the end.
// Read-only against the spine (js/spine.js). ?demo=1 streams fake scores.
/* global qrcode */
import { decodeNight, nightCode, phase, countdown, rotation, playerOfTheNight, applyHidden, shareText, fmtScore, ordinal } from './core.js';
import { createSpine, createFakeSpine } from './spine.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const DEMO = qs.get('demo') === '1';
const GAMES_URL = location.hostname === 'play.btownbrief.com' ? '/games.json' : 'https://play.btownbrief.com/games.json';
const POLL_MS = DEMO ? 2500 : 20000;

function demoNight() {
  const now = new Date(); now.setSeconds(0, 0);
  const mins = Number(qs.get('mins') || 70);
  return { name: 'Arcade Finals Night', sponsor: 'Demo Brewing Co.', games: ['maple-scramble', 'btown-hangman', 'flappy-champ', 'btown-riddle'], start: new Date(now.getTime() - 20 * 60e3).toISOString(), end: new Date(now.getTime() + mins * 60e3).toISOString() };
}

const S = { cfg: null, enc: '', code: '', roster: {}, boards: {}, hidden: [], panels: [], idx: 0, timer: null, revealed: false, unlocked: false, lastSeen: new Map(), spine: null };

async function main() {
  S.enc = qs.get('n') || '';
  S.cfg = DEMO ? demoNight() : decodeNight(S.enc);
  if (!S.cfg) { $('panel').innerHTML = '<div class="slide on"><h2>No night in this link.</h2><div class="sub">Open the screen from the setup page, or add <code>?demo=1</code> to rehearse.</div></div>'; return; }
  S.code = DEMO ? 'DEMO' : nightCode(S.enc);
  $('code').textContent = S.code;
  $('title').innerHTML = esc(S.cfg.name).replace(/ (\S+)$/, ' <em>$1</em>');
  $('sponsor').textContent = S.cfg.sponsor ? `Presented by ${S.cfg.sponsor}` : '';
  try { S.hidden = JSON.parse(localStorage.getItem(`an-hidden-${S.code}`) || '[]'); } catch { S.hidden = []; }
  try { const d = await (await fetch(GAMES_URL, { cache: 'no-cache' })).json(); for (const g of d.games || []) S.roster[g.slug] = g; } catch { /* slugs still work */ }
  S.spine = DEMO ? createFakeSpine({ games: S.cfg.games, startedAt: Date.parse(S.cfg.start) }) : createSpine({ storage: localStorage });
  $('live').classList.toggle('demo', DEMO);
  S.panels = rotation(S.cfg.games);
  buildPanels();
  await refresh();
  rotate();
  setInterval(refresh, POLL_MS);
  setInterval(clock, 1000); clock();
  document.addEventListener('keydown', onKey);
  window.__night = S;
}

function gameName(slug) { return S.roster[slug]?.name || slug.replace(/-/g, ' '); }
function gameEmoji(slug) { return S.roster[slug]?.emoji || '🕹️'; }

function buildPanels() {
  const panel = $('panel'); panel.innerHTML = '';
  S.panels.forEach((p, i) => {
    const d = document.createElement('div'); d.className = 'slide'; d.dataset.i = i;
    if (p.kind === 'game') d.innerHTML = `<h2><span class="e">${gameEmoji(p.slug)}</span>${esc(gameName(p.slug))}</h2><div class="sub">${esc(S.roster[p.slug]?.boardHint || 'Tonight\'s best scores')}</div><div class="board" data-slug="${p.slug}"></div>`;
    else if (p.kind === 'overall') d.innerHTML = `<h2><span class="e">🏆</span>Player of the Night</h2><div class="sub">10 · 7 · 5 · 3 · 2 to the top five on each board, 1 for playing. Most points at the end takes the trophy.</div><div class="board" data-overall="1"></div>`;
    else d.innerHTML = `<div class="how"><div><h2>How to play tonight</h2><ol><li><b>Scan the code</b> or go to play.btownbrief.com and find tonight's games.</li><li><b>Play on your phone</b>, the normal way, under the name you already use.</li><li>Your best score of the night <b>lands on this wall</b>.</li><li>Top five on each board score points. <b>Most points wins the trophy.</b></li></ol></div><div class="qrbox"><div id="qr"></div><div class="code">${S.code}</div><small>play.btownbrief.com/arcade-night</small></div></div>`;
    panel.appendChild(d);
  });
  const url = `${new URL('.', location.href).href}tonight.html?${DEMO ? 'demo=1' : 'n=' + S.enc}`;
  const q = qrcode(0, 'M'); q.addData(url); q.make();
  $('qr').innerHTML = q.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
  $('dots').innerHTML = S.panels.map(() => '<i></i>').join('');
}

function rotate() {
  clearTimeout(S.timer);
  const slides = [...document.querySelectorAll('.slide')];
  slides.forEach((s, i) => s.classList.toggle('on', i === S.idx));
  [...$('dots').children].forEach((d, i) => d.classList.toggle('on', i === S.idx));
  const p = S.panels[S.idx];
  S.timer = setTimeout(() => { S.idx = (S.idx + 1) % S.panels.length; rotate(); }, p.ms);
}

async function refresh() {
  if (S.spine.tick) S.spine.tick();
  const now = Date.now();
  for (const slug of S.cfg.games) {
    try {
      const rows = await S.spine.tonight(S.code, slug, S.cfg.start, now);
      const prevTop = S.boards[slug]?.[0];
      S.boards[slug] = applyHidden(rows, S.hidden);
      const top = S.boards[slug][0];
      if (top && (!prevTop || top.player_id !== prevTop.player_id || top.score !== prevTop.score) && S.lastSeen.size) feedToast(`<b>${esc(top.name)}</b> leads ${esc(gameName(slug))} with <b>${fmtScore(top.score)}</b>`);
      for (const r of rows) S.lastSeen.set(`${slug}:${r.player_id}`, r.score);
    } catch (e) {
      if (e.code === 'not_ready') $('live').textContent = 'The leaderboard read is not switched on yet; the board will fill once it is.';
      else $('live').textContent = 'Lost the connection to the leaderboards; retrying.';
    }
  }
  if (!S.lastSeen.size) for (const slug of S.cfg.games) for (const r of S.boards[slug] || []) S.lastSeen.set(`${slug}:${r.player_id}`, r.score);
  if (!DEMO && S.spine.mode) $('live').textContent = S.spine.mode() === 'window' ? 'Scores land as people play · tonight\'s window read from the arcade leaderboards' : 'Scores land as people play · counting every monthly best that rose since the night opened';
  render();
  if (phase(S.cfg, now) === 'over' && !S.revealed) reveal();
}

function render() {
  for (const el of document.querySelectorAll('.board[data-slug]')) {
    const rows = (S.boards[el.dataset.slug] || []).slice(0, 10);
    el.innerHTML = rows.length ? rows.map((r, i) => `<div class="r${i === 0 ? ' first' : ''}"><span class="rk">${i + 1}</span><span class="nm">${esc(r.name)}</span><span class="sc">${fmtScore(r.score)}</span></div>`).join('') : '<div class="empty">Nobody has played this one yet tonight. Go on.</div>';
  }
  const standings = playerOfTheNight(S.boards);
  const el = document.querySelector('.board[data-overall]');
  el.innerHTML = standings.length ? standings.slice(0, 10).map((p, i) => `<div class="r${i === 0 ? ' first' : ''}"><span class="rk">${i + 1}</span><span class="nm">${esc(p.name)} <span class="games">· ${p.games} game${p.games === 1 ? '' : 's'}${p.firsts ? ` · ${p.firsts} first${p.firsts === 1 ? '' : 's'}` : ''}</span></span><span class="sc">${p.pts} pts</span></div>`).join('') : '<div class="empty">The wall is dark until somebody plays.</div>';
  if (S.revealed) renderFinale(standings);
}

function clock() {
  const now = Date.now(); const ph = phase(S.cfg, now); const c = countdown(S.cfg, now);
  $('clock-lbl').textContent = ph === 'before' ? 'Starts in' : ph === 'over' ? 'Final' : 'Time left';
  $('clock').textContent = ph === 'over' ? '0:00' : c.text;
  $('clockbox').classList.toggle('warn', ph === 'live' && c.ms < 5 * 60e3);
  if (ph === 'over' && !S.revealed) reveal();
}

function reveal() {
  S.revealed = true; clearTimeout(S.timer);
  $('finale').hidden = false;
  renderFinale(playerOfTheNight(S.boards));
  confetti();
}
function unreveal() { S.revealed = false; $('finale').hidden = true; rotate(); }
function renderFinale(standings) {
  const top = standings[0];
  const names = Object.fromEntries(S.cfg.games.map((g) => [g, gameName(g)]));
  $('fin-lbl').textContent = top ? 'Player of the Night' : 'Nobody played';
  $('fin-name').textContent = top ? top.name : 'the trophy waits';
  $('fin-pts').textContent = top ? `${top.pts} points across ${top.games} game${top.games === 1 ? '' : 's'}${top.firsts ? `, ${top.firsts} board${top.firsts === 1 ? '' : 's'} won` : ''}` : '';
  $('fin-runners').innerHTML = standings.slice(1, 4).map((p, i) => `${ordinal(i + 2)} <b>${esc(p.name)}</b> ${p.pts}`).join(' &nbsp;·&nbsp; ');
  $('fin-share').textContent = shareText({ ...S.cfg, boards: S.boards }, standings, names);
  $('fin-sponsor').textContent = S.cfg.sponsor ? `The Btown Arcade Champion, presented by ${S.cfg.sponsor}` : '';
}

// ---- host panel (local passphrase only; nothing server-side) ----
async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
function openHost() { $('host').hidden = false; $('host-lock').hidden = S.unlocked; $('host-tools').hidden = !S.unlocked; if (!S.unlocked) $('host-pass').focus(); renderHidden(); }
function closeHost() { $('host').hidden = true; }
async function unlock() {
  const typed = $('host-pass').value;
  let stored = ''; try { stored = localStorage.getItem(`an-host-${S.code}`) || ''; } catch { /* ignore */ }
  const ok = DEMO ? typed === 'demo' : (stored ? (await sha(typed)) === stored : typed.length > 0);
  if (!ok) { toast('Not the passphrase from setup.'); return; }
  S.unlocked = true; openHost();
  $('host-mode').textContent = DEMO ? 'Demo: fake scores stream in every few seconds.' : `Read mode: ${S.spine.mode() === 'window' ? 'tonight\'s window (get_night_board)' : 'baseline diff over the monthly boards (add supabase/arcade-night-READ.sql for a true window)'}.`;
}
function renderHidden() { $('hidden-list').textContent = S.hidden.length ? `Hidden: ${S.hidden.join(', ')}` : 'Nobody hidden.'; }
function hide(name) {
  const n = name.trim(); if (!n) return;
  S.hidden.push(n); try { localStorage.setItem(`an-hidden-${S.code}`, JSON.stringify(S.hidden)); } catch { /* ignore */ }
  for (const slug of S.cfg.games) S.boards[slug] = applyHidden(S.boards[slug] || [], S.hidden);
  render(); renderHidden(); $('hide-name').value = ''; toast(`${n} is off the wall.`);
}
function unhideAll() { S.hidden = []; try { localStorage.removeItem(`an-hidden-${S.code}`); } catch { /* ignore */ } refresh(); renderHidden(); }
$('host-unlock').addEventListener('click', unlock);
$('host-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') unlock(); });
$('host-close').addEventListener('click', closeHost); $('host-close2').addEventListener('click', closeHost);
$('hide-go').addEventListener('click', () => hide($('hide-name').value));
$('hide-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') hide($('hide-name').value); });
$('unhide-all').addEventListener('click', unhideAll);
$('reveal').addEventListener('click', () => { closeHost(); reveal(); });
$('unreveal').addEventListener('click', () => { closeHost(); unreveal(); });

function onKey(e) {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'h' || e.key === 'H') { $('host').hidden ? openHost() : closeHost(); }
  else if (e.key === ' ') { e.preventDefault(); S.revealed ? unreveal() : reveal(); }
  else if (e.key === 'f' || e.key === 'F') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }
  else if (e.key === 'ArrowRight') { S.idx = (S.idx + 1) % S.panels.length; rotate(); }
  else if (e.key === 'ArrowLeft') { S.idx = (S.idx - 1 + S.panels.length) % S.panels.length; rotate(); }
  else if (e.key === 'Escape') closeHost();
}

// ---- bits ----
let feedTimer = null;
function feedToast(html) { const f = $('feed'); f.innerHTML = html; f.classList.add('show'); clearTimeout(feedTimer); feedTimer = setTimeout(() => f.classList.remove('show'), 4000); }
let toastTimer = null;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2200); }
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = $('confetti'); const colors = ['#FFC94A', '#FFE27A', '#4FB3BF', '#f6f1e6', '#E4572E'];
  for (let i = 0; i < 90; i++) { const el = document.createElement('i'); el.style.left = `${Math.random() * 100}vw`; el.style.background = colors[i % colors.length]; el.style.animationDuration = `${2 + Math.random() * 2}s`; el.style.animationDelay = `${Math.random() * 1.2}s`; el.style.transform = `rotate(${Math.random() * 360}deg)`; box.appendChild(el); setTimeout(() => el.remove(), 5000); }
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

main().catch((e) => { console.error(e); $('panel').innerHTML = `<div class="slide on"><h2>The screen could not start.</h2><div class="sub">${esc(e.message)}</div></div>`; });
