// node --test scripts/test-core.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/core.js';

const cfg = { name: 'Arcade Finals Night', games: ['maple-scramble', 'btown-hangman', 'flappy-champ'], start: '2026-12-03T19:00:00-05:00', end: '2026-12-03T20:30:00-05:00', sponsor: 'Foam Brewers' };

test('night config round-trips through the URL and rejects junk', () => {
  const enc = C.encodeNight(cfg);
  assert.match(enc, /^[A-Za-z0-9_-]+$/);
  const dec = C.decodeNight(enc);
  assert.deepEqual(dec, { name: cfg.name, games: cfg.games, start: cfg.start, end: cfg.end, sponsor: 'Foam Brewers' });
  assert.equal(C.decodeNight('nope'), null);
  assert.equal(C.decodeNight(C.encodeNight({ ...cfg, games: [] }) ), null);
  assert.equal(C.decodeNight(C.encodeNight({ ...cfg, end: cfg.start })), null);
  const seven = C.decodeNight(C.encodeNight({ ...cfg, games: ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7'] }));
  assert.equal(seven.games.length, 6, 'capped at six games');
  assert.equal(C.decodeNight(C.encodeNight({ ...cfg, games: ['<script>', 'ok-game'] })).games.length, 1, 'slugs validated');
});

test('validateNight', () => {
  assert.equal(C.validateNight(cfg).ok, true);
  assert.equal(C.validateNight({ ...cfg, name: ' ' }).ok, false);
  assert.equal(C.validateNight({ ...cfg, games: [] }).ok, false);
  assert.equal(C.validateNight({ ...cfg, end: '2026-12-04T19:00:00-05:00' }).ok, false, 'over twelve hours');
});

test('night code is short, stable, and from the no-lookalike alphabet', () => {
  const a = C.nightCode(C.encodeNight(cfg));
  assert.equal(a.length, 4);
  assert.equal(a, C.nightCode(C.encodeNight(cfg)));
  assert.notEqual(a, C.nightCode(C.encodeNight({ ...cfg, name: 'Other' })));
  for (const ch of a) assert.ok(C.CODE_ALPHABET.includes(ch), ch);
});

test('phase and countdown', () => {
  const s = Date.parse(cfg.start), e = Date.parse(cfg.end);
  assert.equal(C.phase(cfg, s - 1), 'before');
  assert.equal(C.phase(cfg, s), 'live');
  assert.equal(C.phase(cfg, e), 'over');
  assert.equal(C.countdown(cfg, e - 61_000).text, '1:01');
  assert.equal(C.countdown(cfg, s).text, '1:30:00');
  assert.equal(C.countdown(cfg, e + 5).ms, 0);
  assert.equal(C.monthKey(Date.UTC(2026, 11, 3, 23, 30)), '2026-12');
  assert.equal(C.monthKey(Date.UTC(2027, 0, 1, 3, 0)), '2026-12', 'UTC Jan 1 is still Dec 31 in Burlington');
});

test('tonightRows: only scores that rose or appeared since the snapshot count', () => {
  const base = [{ player_id: 'a', name: 'Ann', score: 900 }, { player_id: 'b', name: 'Bob', score: 500 }];
  const cur = [{ player_id: 'a', name: 'Ann', score: 900 }, { player_id: 'b', name: 'Bob', score: 650 }, { player_id: 'c', name: 'Cy', score: 400 }];
  assert.deepEqual(C.tonightRows(base, cur), [{ player_id: 'b', name: 'Bob', score: 650 }, { player_id: 'c', name: 'Cy', score: 400 }]);
  assert.deepEqual(C.tonightRows(null, cur).length, 3);
  assert.deepEqual(C.applyHidden(cur, ['BOB']).map((r) => r.name), ['Ann', 'Cy']);
  assert.deepEqual(C.applyHidden(cur, ['c']).map((r) => r.name), ['Ann', 'Bob']);
});

test('Player of the Night: rank points, ties by games played then firsts', () => {
  const boards = {
    'maple-scramble': [{ player_id: 'a', name: 'Ann', score: 30000 }, { player_id: 'b', name: 'Bob', score: 29000 }, { player_id: 'c', name: 'Cy', score: 100 }],
    'btown-hangman': [{ player_id: 'b', name: 'Bob', score: 40000 }, { player_id: 'a', name: 'Ann', score: 39000 }],
    'flappy-champ': [{ player_id: 'c', name: 'Cy', score: 50 }, { player_id: 'd', name: 'Dee', score: 40 }, { player_id: 'e', name: 'Eve', score: 30 }, { player_id: 'f', name: 'Fay', score: 20 }, { player_id: 'g', name: 'Gus', score: 10 }, { player_id: 'h', name: 'Hal', score: 5 }],
  };
  const s = C.playerOfTheNight(boards);
  assert.equal(s[0].name, 'Ann'); assert.equal(s[0].pts, 17); // 10 + 7
  assert.equal(s[1].name, 'Bob'); assert.equal(s[1].pts, 17); // 7 + 10 → tie on pts and games, Ann wins on... both have 1 first
  assert.equal(s[2].name, 'Cy'); assert.equal(s[2].pts, 15);  // 5 + 10
  assert.equal(s.find((p) => p.name === 'Hal').pts, C.PLAYED_POINTS, '6th place still gets a point for playing');
  assert.equal(C.rankPointsFor(0), 10); assert.equal(C.rankPointsFor(4), 2); assert.equal(C.rankPointsFor(9), 1);
});

test('rotation and share text', () => {
  const r = C.rotation(cfg.games);
  assert.deepEqual(r.map((p) => p.kind), ['game', 'game', 'game', 'overall', 'how']);
  const standings = C.playerOfTheNight({ 'maple-scramble': [{ player_id: 'a', name: 'Ann', score: 31000 }] });
  const txt = C.shareText({ ...cfg, boards: { 'maple-scramble': [{ player_id: 'a', name: 'Ann', score: 31000 }] } }, standings, { 'maple-scramble': 'Maple Scramble' });
  assert.match(txt, /^🏆 Arcade Finals Night, presented by Foam Brewers/);
  assert.match(txt, /Player of the Night: Ann — 10 pts across 1 game\n/);
  assert.match(txt, /Maple Scramble: Ann 31,000/);
  assert.ok(!/undefined|NaN/.test(txt));
  assert.equal(C.ordinal(1), '1st'); assert.equal(C.ordinal(12), '12th'); assert.equal(C.ordinal(23), '23rd');
});
