'use strict';
// ===== Шпигун — сервер гри =====
// Запуск: node server.js   (Node.js 18+, без залежностей)
// Працює і локально (http://localhost:3000), і на хостингу (Render тощо).
// Ведучий (ноутбук) створює кімнату з кодом, гравці заходять з телефонів за QR або кодом.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');
const { THEMES, ITEMS } = require('./data');

const PORT = Number(process.env.PORT) || 3000;
const PUB = path.join(__dirname, 'public');
const MAX_PLAYERS = 8;
const MAX_ROOMS = 300;

// тривалість етапів, секунди
const SEC = { pick: 25, question: 50, explain: 40, names: 75, drawing: 70, vote: 45, guess: 25, verdict: 30, words: 40 };

const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pickOne = a => a[Math.floor(Math.random() * a.length)];
const rid = () => crypto.randomBytes(6).toString('hex');

const PAIRS = [];
for (const [theme, locs] of Object.entries(THEMES)) for (const loc of locs) PAIRS.push({ theme, loc });

// ---------- кімнати ----------
const rooms = new Map();
function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // без I та O, щоб не плутати з 1 і 0
  let c;
  do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
}

function createRoom(usedInit) {
  const room = { code: newCode(), hostKey: crypto.randomBytes(16).toString('hex'), conns: new Set(), online: new Map(), polled: new Map(), lastActive: Date.now() };

  let players = [];            // { id, name, alive, char }
  let S = { phase: 'lobby' };  // стан поточної партії
  let timer = null;
  const { online, polled } = room;
  const isOnline = id => (online.get(id) || 0) > 0 || Date.now() - (polled.get(id) || 0) < 8000;
  const broadcast = () => { for (const c of room.conns) { try { c.res.write('data: ' + JSON.stringify(c.host ? hostView() : playerView(c.id)) + '\n\n'); } catch (e) {} } };

  // зіграні локації (список приходить з браузера ноутбука і туди ж повертається)
  const used = new Set((Array.isArray(usedInit) ? usedInit : []).filter(x => typeof x === 'string').slice(0, 3000));
  let lastTheme = null;
  function nextPair() {
    const key = p => p.theme + '|' + p.loc;
    let pool = PAIRS.filter(p => !used.has(key(p)));
    if (!pool.length) { used.clear(); pool = PAIRS; }   // усі зіграно — нове коло
    const fresh = pool.filter(p => p.theme !== lastTheme);   // тема не повторюється двічі поспіль
    const pair = pickOne(fresh.length ? fresh : pool);
    used.add(key(pair)); lastTheme = pair.theme;
    return pair;
  }

  const byId = id => players.find(p => p.id === id);
  const alive = () => players.filter(p => p.alive);
  const nm = id => (byId(id) || {}).name || '?';

  function setTimer(sec, fn) {
    clearTimeout(timer);
    S.endsAt = Date.now() + sec * 1000;
    timer = setTimeout(() => { timer = null; fn(); broadcast(); }, sec * 1000 + 400);
  }
  function clearTimer() { clearTimeout(timer); timer = null; S.endsAt = 0; }

  // ---------- хід гри ----------
  function startGame() {
    players = players.filter(p => isOnline(p.id));
    if (players.length < 3) return 'Потрібно щонайменше 3 гравці';
    const pair = nextPair();
    players.forEach(p => { p.alive = true; p.char = ''; });
    clearTimer();
    S = { phase: 'roles', theme: pair.theme, location: pair.loc, spyId: pickOne(players).id, sub: {}, voteNo: 1, notice: '', endsAt: 0 };
    return null;
  }

  function toNames() { S.phase = 'names'; S.sub = {}; setTimer(SEC.names, revealNames); }
  function revealNames() {
    clearTimer();
    players.forEach(p => { p.char = S.sub[p.id] || '(без імені)'; });
    S.sub = {}; S.phase = 'namesReveal';
  }

  function toQuestions() { S.phase = 'questions'; S.order = shuffle(alive().map(p => p.id)); S.idx = 0; startAsk(); }
  function startAsk() { S.stage = 'pick'; S.target = null; setTimer(SEC.pick, questionsTimeout); }
  function startAnswer() { S.stage = 'ask'; setTimer(SEC.question, questionsTimeout); }
  function questionsTimeout() {
    if (S.stage === 'pick') {
      const cur = S.order[S.idx];
      S.target = pickOne(alive().filter(p => p.id !== cur)).id;
      startAnswer();
    } else nextAsk();
  }
  function nextAsk() { S.idx++; if (S.idx >= S.order.length) toExtra(); else startAsk(); }

  function toExtra() {
    clearTimer();
    S.extra = Math.random() < .5 ? 'drawing' : 'items';
    if (S.extra === 'drawing') { S.phase = 'drawing'; S.sub = {}; setTimer(SEC.drawing, revealDrawings); }
    else {
      S.phase = 'items';
      S.items = shuffle(ITEMS).slice(0, 12).map(([e, n]) => ({ e, n, by: null }));
      S.order = shuffle(alive().map(p => p.id)); S.idx = 0;
      startPick();
    }
  }
  function revealDrawings() { clearTimer(); S.drawings = { ...S.sub }; S.sub = {}; S.phase = 'drawReveal'; }
  function startPick() { S.stage = 'pick'; setTimer(SEC.pick, itemsTimeout); }
  function startExplain() { S.stage = 'explain'; setTimer(SEC.explain, itemsTimeout); }
  function itemsTimeout() {
    if (S.stage === 'pick') { pickOne(S.items.filter(i => !i.by)).by = S.order[S.idx]; startExplain(); }
    else nextItem();
  }
  function nextItem() { S.idx++; if (S.idx >= S.order.length) { clearTimer(); S.phase = 'itemsDone'; } else startPick(); }

  function toVote(cands) {
    if (!cands) { S.revote = false; S.notice = ''; }
    S.phase = 'vote'; S.votes = {}; S.cands = cands || null;
    setTimer(SEC.vote, tally);
  }
  function tally() {
    clearTimer();
    const counts = {};
    for (const t of Object.values(S.votes)) counts[t] = (counts[t] || 0) + 1;
    const max = Math.max(0, ...Object.values(counts));
    const top = max ? Object.keys(counts).filter(k => counts[k] === max) : [];
    let out = null;
    if (top.length === 1) out = top[0];
    else if (top.length > 1 && !S.revote) {
      S.revote = true;
      S.notice = 'Нічия! Переголосування між: ' + top.map(nm).join(', ');
      return toVote(top);
    }
    S.revote = false; S.notice = '';
    if (out) byId(out).alive = false;
    S.res = { counts, out };
    S.phase = 'voteResult';
  }

  function toGuess() { S.phase = 'guess'; S.guess = ''; setTimer(SEC.guess, afterGuess); }
  function afterGuess() {
    clearTimer();
    if (S.guess) { S.phase = 'verdict'; S.verdict = {}; setTimer(SEC.verdict, finishVerdict); }
    else resolveNoGuess();
  }
  const judges = () => players.filter(p => p.id !== S.spyId);
  function finishVerdict() {
    clearTimer();
    const v = Object.values(S.verdict);
    const yes = v.filter(Boolean).length;
    if (yes > v.length - yes) endGame('spy', 'guessed'); else endGame('town', 'wrong');
  }
  function resolveNoGuess() {
    const out = S.res && S.res.out;
    if (out === S.spyId) return endGame('town', 'caught');
    if (alive().length <= 2) return endGame('spy', 'fewLeft');
    if (S.voteNo >= 2) return endGame('spy', 'survived');
    S.voteNo = 2;
    toWords();
    S.notice = out ? `${nm(out)} — не шпигун` : 'Нікого не вигнали';
  }

  function toWords() { S.phase = 'words'; S.sub = {}; setTimer(SEC.words, revealWords); }
  function revealWords() { clearTimer(); S.words = { ...S.sub }; S.sub = {}; S.phase = 'wordsReveal'; }

  function endGame(winner, reason) { clearTimer(); S.phase = 'end'; S.win = { winner, reason }; }

  function toLobby() { clearTimer(); S = { phase: 'lobby' }; players.forEach(p => { p.alive = true; p.char = ''; }); }

  // кнопка «Далі» / «Не чекати» на ноутбуці
  function hostNext() {
    switch (S.phase) {
      case 'roles': return toNames();
      case 'names': return revealNames();
      case 'namesReveal': return toQuestions();
      case 'questions': return questionsTimeout();
      case 'drawing': return revealDrawings();
      case 'drawReveal': return toVote();
      case 'items': return itemsTimeout();
      case 'itemsDone': return toVote();
      case 'vote': return tally();
      case 'voteResult': return toGuess();
      case 'guess': return afterGuess();
      case 'verdict': return finishVerdict();
      case 'words': return revealWords();
      case 'wordsReveal': return toVote();
    }
  }

  // ---------- дії ----------
  function handle(b) {
    const id = b.id, p = id ? byId(id) : null;
    switch (b.action) {
      case 'join': {
        const name = String(b.name || '').trim().slice(0, 16);
        if (p) { if (name && S.phase === 'lobby') p.name = name; return { id }; }
        if (S.phase !== 'lobby') return { error: 'Гра вже йде. Дочекайтеся наступної партії.' };
        if (!name) return { error: "Введіть ім'я" };
        if (players.length >= MAX_PLAYERS) return { error: `Уже ${MAX_PLAYERS} гравців` };
        let n = name, k = 2;
        while (players.some(x => x.name.toLowerCase() === n.toLowerCase())) n = `${name} ${k++}`;
        const np = { id: rid(), name: n, alive: true, char: '' };
        players.push(np);
        return { id: np.id };
      }
      case 'leave':
        if (S.phase === 'lobby') players = players.filter(x => x.id !== id);
        return {};
      case 'ready':
        if (S.phase === 'roles' && p) { S.sub[id] = true; if (players.every(x => S.sub[x.id])) toNames(); }
        return {};
      case 'name': {
        const t = String(b.text || '').trim().slice(0, 40);
        if (S.phase === 'names' && p && t) { S.sub[id] = t; if (players.every(x => S.sub[x.id])) revealNames(); }
        return {};
      }
      case 'target':
        if (S.phase === 'questions' && S.stage === 'pick' && S.order[S.idx] === id) {
          const t = byId(b.target);
          if (t && t.alive && t.id !== id) { S.target = t.id; startAnswer(); }
        }
        return {};
      case 'asked':
        if (S.phase === 'questions' && S.stage === 'ask' && S.order[S.idx] === id) nextAsk();
        return {};
      case 'draw':
        if (S.phase === 'drawing' && p && p.alive && typeof b.img === 'string' && b.img.startsWith('data:image/') && b.img.length < 1.5e6) {
          S.sub[id] = b.img;
          if (alive().every(x => S.sub[x.id])) revealDrawings();
        }
        return {};
      case 'pick':
        if (S.phase === 'items' && S.stage === 'pick' && S.order[S.idx] === id) {
          const it = S.items[b.index];
          if (it && !it.by) { it.by = id; startExplain(); }
        }
        return {};
      case 'explained':
        if (S.phase === 'items' && S.stage === 'explain' && S.order[S.idx] === id) nextItem();
        return {};
      case 'vote': {
        const t = byId(b.target);
        if (S.phase === 'vote' && p && p.alive && t && t.alive && t.id !== id && (!S.cands || S.cands.includes(t.id))) {
          S.votes[id] = t.id;
          if (alive().every(x => S.votes[x.id])) tally();
        }
        return {};
      }
      case 'guess': {
        const t = String(b.text || '').trim().slice(0, 60);
        if (S.phase === 'guess' && id === S.spyId && t) { S.guess = t; afterGuess(); }
        return {};
      }
      case 'skip':
        if (S.phase === 'guess' && id === S.spyId) { S.guess = ''; afterGuess(); }
        return {};
      case 'verdict':
        if (S.phase === 'verdict' && p && id !== S.spyId) {
          S.verdict[id] = !!b.yes;
          if (judges().every(x => x.id in S.verdict)) finishVerdict();
        }
        return {};
      case 'word': {
        const w = String(b.text || '').trim().split(/\s+/)[0].slice(0, 24);
        if (S.phase === 'words' && p && p.alive && w) { S.sub[id] = w; if (alive().every(x => S.sub[x.id])) revealWords(); }
        return {};
      }
      // ноутбук (лише з ключем, який знає екран гри на ноутбуці)
      case 'start': case 'next': case 'lobby': case 'kick':
        if (b.key !== room.hostKey) return { error: 'Керувати грою можна лише з екрана ведучого' };
        return hostAction(b);
    }
    return { error: 'Невідома дія' };
  }
  function hostAction(b) {
    switch (b.action) {
      case 'start': { const e = startGame(); return e ? { error: e } : {}; }
      case 'next': hostNext(); return {};
      case 'lobby': toLobby(); return {};
      case 'kick': if (S.phase === 'lobby') players = players.filter(x => x.id !== b.target); return {};
    }
    return {};
  }

  // ---------- що бачить кожен ----------
  function publicView() {
    const ph = S.phase;
    const showChars = !['lobby', 'roles', 'names'].includes(ph);
    const v = {
      code: room.code, phase: ph, now: Date.now(), endsAt: S.endsAt || 0,
      theme: ph === 'lobby' ? null : S.theme,
      notice: S.notice || '', voteNo: S.voteNo || 1, extra: S.extra || null,
      players: players.map(p => ({ id: p.id, name: p.name, alive: p.alive !== false, online: isOnline(p.id), char: showChars ? p.char : '' })),
      done: [],
    };
    if (['roles', 'names', 'drawing', 'words'].includes(ph)) v.done = Object.keys(S.sub || {});
    if (ph === 'vote') { v.done = Object.keys(S.votes); v.cands = S.cands; v.revote = !!S.revote; }
    if (ph === 'verdict') { v.done = Object.keys(S.verdict); v.guess = S.guess; }
    if (ph === 'questions' || ph === 'items') { v.order = S.order; v.idx = S.idx; v.stage = S.stage; v.target = S.target || null; }
    if (ph === 'items' || ph === 'itemsDone') v.items = S.items;
    if (ph === 'voteResult') v.res = S.res;
    if (ph === 'wordsReveal') v.words = S.words;
    if (ph === 'end') v.end = { ...S.win, location: S.location, spyId: S.spyId, guess: S.guess || '' };
    return v;
  }
  function hostView() {
    const v = publicView();
    v.lanUrls = lanUrls();
    // ноутбук зберігає список зіграних локацій собі; поточну додаємо лише після кінця партії, щоб не світити її
  if (S.phase === 'roles' || S.phase === 'end') v.used = [...used].filter(k => S.phase === 'end' || k !== S.theme + '|' + S.location);
    if (S.phase === 'drawReveal') v.drawings = S.drawings;
    return v;
  }
  function playerView(id) {
    const v = publicView();
    const p = byId(id);
    if (!p) { v.me = null; return v; }
    const inGame = S.phase !== 'lobby';
    const isSpy = inGame && S.spyId === id;
    v.me = {
      id, name: p.name, alive: p.alive !== false, isSpy,
      location: inGame && !isSpy ? S.location : null,
      mine: S.sub ? S.sub[id] || null : null,
      vote: S.votes ? S.votes[id] || null : null,
      verdict: S.verdict && id in S.verdict ? S.verdict[id] : null,
    };
    if (S.phase === 'drawing' && v.me.mine) v.me.mine = true;   // картинку назад не шлемо
    return v;
  }

  Object.assign(room, { handle, hostView, playerView, broadcast, isOnline, byId, stop: () => clearTimeout(timer) });
  rooms.set(room.code, room);
  return room;
}

// старі порожні кімнати прибираємо
setInterval(() => {
  for (const [code, r] of rooms) if (!r.conns.size && Date.now() - r.lastActive > 3 * 3600e3) { r.stop(); rooms.delete(code); }
}, 10 * 60e3);

// ---------- мережа ----------
function lanUrls() {
  const list = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal) {
        let score = 0;
        if (/^192\.168\./.test(a.address)) score += 3;
        else if (/^10\./.test(a.address)) score += 2;
        else if (/^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) score += 1;
        if (/vEthernet|VirtualBox|VMware|WSL|Docker|Hyper-V|vmnet|Loopback|Bluetooth/i.test(name)) score -= 10;
        list.push({ score, url: `http://${a.address}:${PORT}/play` });
      }
    }
  }
  list.sort((a, b) => b.score - a.score);
  return list.map(x => x.url);
}

setInterval(() => {
  for (const r of rooms.values()) for (const c of r.conns) { try { c.res.write('event: ping\ndata: 1\n\n'); } catch (e) {} }
}, 15000);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const ROUTES = { '/': 'host.html', '/play': 'play.html', '/play/': 'play.html' };
const getRoom = code => rooms.get(String(code || '').trim().toUpperCase());
const json = (res, obj) => { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  const q = k => u.searchParams.get(k) || '';

  if (req.method === 'GET' && u.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 1500\n\n');
    const room = getRoom(q('room'));
    if (!room) { res.write('data: {"noRoom":true}\n\n'); return res.end(); }
    const c = { res, id: q('id'), host: q('host') === '1' && q('key') === room.hostKey };
    room.conns.add(c); room.lastActive = Date.now();
    if (c.id) room.online.set(c.id, (room.online.get(c.id) || 0) + 1);
    room.broadcast();
    req.on('close', () => {
      room.conns.delete(c);
      if (c.id) room.online.set(c.id, Math.max(0, (room.online.get(c.id) || 1) - 1));
      room.broadcast();
    });
    return;
  }

  if (req.method === 'GET' && u.pathname === '/state') {   // запасний режим: опитування замість SSE
    const room = getRoom(q('room'));
    if (!room) return json(res, { noRoom: true });
    room.lastActive = Date.now();
    const id = q('id');
    if (id && room.byId(id)) { const was = room.isOnline(id); room.polled.set(id, Date.now()); if (!was) setTimeout(room.broadcast, 0); }
    return json(res, q('host') === '1' && q('key') === room.hostKey ? room.hostView() : room.playerView(id));
  }

  if (req.method === 'GET' && u.pathname === '/exists') {
    const room = getRoom(q('room'));
    return json(res, { ok: !!room && room.hostKey === q('key') });
  }

  if (req.method === 'POST' && u.pathname === '/api') {
    let body = '';
    req.on('data', d => { body += d; if (body.length > 3e6) req.destroy(); });
    req.on('end', () => {
      let b; try { b = JSON.parse(body || '{}'); } catch (e) { return json(res, { error: 'Помилка запиту' }); }
      if (b.action === 'create') {
        if (rooms.size >= MAX_ROOMS) return json(res, { error: 'Сервер переповнений, спробуйте пізніше' });
        const r = createRoom(b.used);
        return json(res, { room: r.code, key: r.hostKey });
      }
      const room = getRoom(b.room);
      if (!room) return json(res, { error: 'Кімнату не знайдено. Перевір код.', noRoom: true });
      room.lastActive = Date.now();
      let out;
      try { out = room.handle(b); } catch (e) { console.error(e); out = { error: 'Помилка гри' }; }
      json(res, out || {});
      room.broadcast();
    });
    return;
  }

  const file = ROUTES[u.pathname] || u.pathname.replace(/^\/+/, '');
  const full = path.join(PUB, path.normalize(file));
  if (!full.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Не знайдено'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  ШПИГУН запущено!\n');
  console.log(`  Екран ведучого:  http://localhost:${PORT}`);
  console.log('  Щоб зупинити — Ctrl+C\n');
  if (!process.env.NO_OPEN && !process.env.RENDER && !process.env.PORT) {
    const url = `http://localhost:${PORT}`;
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => {});
  }
});
server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.log(`\n  Порт ${PORT} зайнятий. Можливо, гра вже запущена в іншому вікні.\n`);
  else console.log(e);
  process.exit(1);
});
