'use strict';
// ===== Шпигун — сервер гри =====
// Запуск: node server.js   (Node.js 18+, без залежностей)
// Кімнату створює будь-хто з телефона (і стає ведучим) або великий екран (/screen).
// Гравці заходять за посиланням ?r=КОД або вводять код.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');
const { THEMES, ITEMS } = require('./data');

const PORT = Number(process.env.PORT) || 3000;
const PUB = path.join(__dirname, 'public');
const MAX_PLAYERS = 12;
const TWO_SPIES_FROM = 7;   // з такої кількості гравців — 2 шпигуни
const MAX_ROOMS = 300;

// тривалість етапів, секунди
// дістає з тексту лише емодзі (з урахуванням складених, як 👨‍🍳 чи 🇺🇦)
const seg = new Intl.Segmenter('uk', { granularity: 'grapheme' });
function onlyEmoji(t) {
  return [...seg.segment(String(t || '').slice(0, 200))].map(x => x.segment).filter(g => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g));
}

const SEC = {
  roles: 45, names: 75,
  question: 120,                      // одне питання й відповідь (допит іде по колу)
  drawing: 70, itemPick: 25, explain: 120,
  vote: 45, guess: 30, verdict: 45, words: 40, emoji: 120,
  // показ результатів (ведучий може натиснути «Далі» раніше)
  namesReveal: 25, drawReveal: 45, itemsDone: 15, voteResult: 12, wordsReveal: 25, emojiReveal: 30,
};

const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pickOne = a => a[Math.floor(Math.random() * a.length)];
const rid = (n = 6) => crypto.randomBytes(n).toString('hex');

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
  const room = {
    code: newCode(), hostKey: rid(16), hostId: null,
    conns: new Set(), online: new Map(), polled: new Map(), lastActive: Date.now(), hostOffSince: 0,
  };

  let players = [];            // { id, token, name, alive, char }
  let S = { phase: 'lobby' };  // стан поточної партії
  let timer = null;
  const { online, polled } = room;
  const isOnline = id => !(byId(id) || {}).left && (online.get(id) || 0) > 0 || Date.now() - (polled.get(id) || 0) < 8000;

  // зіграні локації (список зберігає браузер ведучого)
  const used = new Set((Array.isArray(usedInit) ? usedInit : []).filter(x => typeof x === 'string').slice(0, 3000));
  let lastTheme = null;
  function nextPair() {
    const key = p => p.theme + '|' + p.loc;
    let pool = PAIRS.filter(p => !used.has(key(p)));
    if (!pool.length) { used.clear(); pool = PAIRS; }
    const fresh = pool.filter(p => p.theme !== lastTheme);   // тема не повторюється двічі поспіль
    const pair = pickOne(fresh.length ? fresh : pool);
    used.add(key(pair)); lastTheme = pair.theme;
    return pair;
  }

  const byId = id => players.find(p => p.id === id);
  const byToken = t => (t ? players.find(p => p.token === t && !p.left) : null);
  const alive = () => players.filter(p => p.alive);
  const nm = id => { const x = byId(id); return x ? (x.char || x.name) : '?'; };   // ім'я персонажа, коли воно вже є

  function setTimer(sec, fn) {
    clearTimeout(timer);
    S.endsAt = Date.now() + sec * 1000;
    timer = setTimeout(() => { timer = null; fn(); broadcast(); }, sec * 1000 + 400);
  }
  function clearTimer() { clearTimeout(timer); timer = null; S.endsAt = 0; }

  // ---------- хід гри ----------
  function startGame() {
    players = players.filter(p => isOnline(p.id));
    if (room.hostId && !byId(room.hostId)) room.hostId = players[0] ? players[0].id : null;
    if (players.length < 3) return 'Потрібно щонайменше 3 гравці';
    const pair = nextPair();
    players.forEach(p => { p.alive = true; p.char = ''; });
    clearTimer();
    const spyIds = shuffle(players).slice(0, players.length >= TWO_SPIES_FROM ? 2 : 1).map(p => p.id);
    S = { tally: null, phase: 'roles', theme: pair.theme, location: pair.loc, spyIds, sub: {}, voteNo: 1, notice: '', endsAt: 0, game: rid(3) };
    setTimer(SEC.roles, toNames);
    return null;
  }

  function toNames() { S.phase = 'names'; S.sub = {}; setTimer(SEC.names, revealNames); }
  function revealNames() {
    players.forEach(p => { p.char = S.sub[p.id] || '(без імені)'; });
    S.sub = {}; S.phase = 'namesReveal';
    setTimer(SEC.namesReveal, toQuestions);
  }

  // допит по колу: кожен питає наступного, останній — першого
  function toQuestions() { S.phase = 'questions'; S.order = shuffle(alive().map(p => p.id)); S.idx = 0; startAsk(); }
  function startAsk() { S.stage = 'ask'; S.target = S.order[(S.idx + 1) % S.order.length]; setTimer(SEC.question, nextAsk); }
  function questionsTimeout() { nextAsk(); }
  function nextAsk() { S.idx++; if (S.idx >= S.order.length) toExtra(); else startAsk(); }

  // після допиту — малювання або предмети, по черзі між партіями; потім емодзі
  let drawNext = Math.random() < .5;
  function toExtra() {
    S.extras = [drawNext ? 'drawing' : 'items'];
    drawNext = !drawNext;
    S.extraIdx = 0;
    startExtra();
  }
  function nextExtra() { S.extraIdx++; if (S.extraIdx < S.extras.length) startExtra(); else toEmoji(); }

  // емодзі: кожен за 2 хвилини вводить 3 емодзі про локацію, потім показуємо всім
  function toEmoji() { S.phase = 'emoji'; S.sub = {}; setTimer(SEC.emoji, revealEmoji); }
  function revealEmoji() { S.emojis = { ...S.sub }; S.sub = {}; S.phase = 'emojiReveal'; setTimer(SEC.emojiReveal, () => toVote()); }
  function startExtra() {
    S.extra = S.extras[S.extraIdx];
    if (S.extra === 'drawing') { S.phase = 'drawing'; S.sub = {}; setTimer(SEC.drawing, revealDrawings); }
    else {
      S.phase = 'items';
      S.items = shuffle(ITEMS).slice(0, 12).map(([e, n]) => ({ e, n, by: null }));
      S.order = shuffle(alive().map(p => p.id)); S.idx = 0;
      startPick();
    }
  }
  function revealDrawings() { S.drawings = { ...S.sub }; S.sub = {}; S.phase = 'drawReveal'; setTimer(SEC.drawReveal, nextExtra); }
  function startPick() { S.stage = 'pick'; setTimer(SEC.itemPick, itemsTimeout); }
  function startExplain() { S.stage = 'explain'; setTimer(SEC.explain, itemsTimeout); }
  function itemsTimeout() {
    if (S.stage === 'pick') { pickOne(S.items.filter(i => !i.by)).by = S.order[S.idx]; startExplain(); }
    else nextItem();
  }
  function nextItem() { S.idx++; if (S.idx >= S.order.length) { S.phase = 'itemsDone'; setTimer(SEC.itemsDone, nextExtra); } else startPick(); }

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
    setTimer(SEC.voteResult, toGuess);
  }

  const isSpy = id => !!S.spyIds && S.spyIds.includes(id);
  // хто зі шпигунів може зараз назвати локацію: живі + щойно вигнаний
  const guessers = () => S.spyIds.filter(id => { const x = byId(id); return x && (x.alive || (S.res && S.res.out === id)); });
  function toGuess() { S.phase = 'guess'; S.guess = ''; S.guessBy = null; S.skips = {}; setTimer(SEC.guess, afterGuess); }
  function afterGuess() {
    if (S.guess) { S.phase = 'verdict'; S.verdict = {}; setTimer(SEC.verdict, finishVerdict); }
    else resolveNoGuess();
  }
  const judges = () => players.filter(p => !isSpy(p.id));
  function finishVerdict() {
    const v = Object.values(S.verdict);
    const yes = v.filter(Boolean).length, no = v.length - yes;
    S.tally = { yes, no };
    // більшість тих, хто проголосував; при нічиї — на користь шпигуна
    if (yes > 0 && yes >= no) endGame('spy', 'guessed'); else endGame('town', 'wrong');
  }
  function resolveNoGuess() {
    const out = S.res && S.res.out;
    const spiesLeft = S.spyIds.filter(id => byId(id) && byId(id).alive).length;
    if (!spiesLeft) return endGame('town', 'caught');
    if (alive().length - spiesLeft <= spiesLeft) return endGame('spy', 'fewLeft');
    if (S.voteNo >= 2) return endGame('spy', 'survived');
    S.voteNo = 2;
    toWords();
    S.notice = !out ? 'Нікого не вигнали' : isSpy(out) ? `${nm(out)} — шпигун! Але серед вас є ще один` : `${nm(out)} — не шпигун`;
  }

  function toWords() { S.phase = 'words'; S.sub = {}; setTimer(SEC.words, revealWords); }
  function revealWords() { S.words = { ...S.sub }; S.sub = {}; S.phase = 'wordsReveal'; setTimer(SEC.wordsReveal, () => toVote()); }

  function endGame(winner, reason) { clearTimer(); S.phase = 'end'; S.win = { winner, reason }; }
  function toLobby() { clearTimer(); S = { phase: 'lobby' }; players = players.filter(p => !p.left); players.forEach(p => { p.alive = true; p.char = ''; }); }

  // гравець вийшов посеред партії: вибуває; якщо пішов шпигун або лишилось менше 3 — партію зупиняємо
  function leaveMidGame(p) {
    const id = p.id, who = p.char || p.name;
    p.left = true; p.alive = false;
    if (room.hostId === id) {
      const next = players.find(x => !x.left && isOnline(x.id)) || players.find(x => !x.left);
      room.hostId = next ? next.id : null; room.hostOffSince = 0;
    }
    const here = players.filter(x => !x.left);
    if (S.phase === 'end') return;
    if (isSpy(id) || here.length < 3) {
      toLobby();
      S.notice = `${who} вийшов із гри — партію зупинено.` + (here.length < 3 ? ' Замало гравців.' : '');
      return;
    }
    // прибрати з черги ходів
    if (S.order && ['questions', 'items'].includes(S.phase)) {
      const i = S.order.indexOf(id);
      if (i >= 0) {
        const wasTarget = S.target === id;
        S.order.splice(i, 1);
        if (i < S.idx) S.idx--;
        if (S.phase === 'questions') {
          if (i === S.idx || wasTarget) { if (S.idx >= S.order.length) toExtra(); else startAsk(); }
        } else if (i === S.idx) { S.idx--; nextItem(); }
      }
    }
    if (S.votes) for (const [k, t] of Object.entries(S.votes)) if (k === id || t === id) delete S.votes[k];
    if (S.cands) S.cands = S.cands.filter(x => x !== id);
    S.notice = (S.notice ? S.notice + " " : "") + `${who} вийшов із гри.`;
    switch (S.phase) {
      case 'roles': if (here.every(x => S.sub[x.id])) toNames(); break;
      case 'names': if (here.every(x => S.sub[x.id])) revealNames(); break;
      case 'drawing': if (alive().every(x => S.sub[x.id])) revealDrawings(); break;
      case 'words': if (alive().every(x => S.sub[x.id])) revealWords(); break;
      case 'emoji': if (alive().every(x => S.sub[x.id])) revealEmoji(); break;
      case 'vote': if (alive().every(x => S.votes[x.id])) tally(); break;
      case 'verdict': if (judges().filter(x => isOnline(x.id)).every(x => x.id in S.verdict)) finishVerdict(); break;
    }
  }

  // «Далі» / «Не чекати» від ведучого
  function hostNext() {
    switch (S.phase) {
      case 'roles': return toNames();
      case 'names': return revealNames();
      case 'namesReveal': return toQuestions();
      case 'questions': return questionsTimeout();
      case 'drawing': return revealDrawings();
      case 'drawReveal': return nextExtra();
      case 'items': return itemsTimeout();
      case 'itemsDone': return nextExtra();
      case 'emoji': return revealEmoji();
      case 'emojiReveal': return toVote();
      case 'vote': return tally();
      case 'voteResult': return toGuess();
      case 'guess': return afterGuess();
      case 'verdict': return;   // рішення мирних не можна пропустити
      case 'words': return revealWords();
      case 'wordsReveal': return toVote();
    }
  }

  // ---------- дії ----------
  function addPlayer(name) {
    let n = name, k = 2;
    while (players.some(x => x.name.toLowerCase() === n.toLowerCase())) n = `${name} ${k++}`;
    const np = { id: rid(), token: rid(12), name: n, alive: true, char: '' };
    players.push(np);
    return np;
  }

  function handle(b) {
    const p = byToken(b.token), id = p ? p.id : null;
    const isHost = b.key === room.hostKey || (id && id === room.hostId);
    switch (b.action) {
      case 'join': {
        const name = String(b.name || '').trim().slice(0, 16);
        if (p) { if (name && S.phase === 'lobby') p.name = name; return { id: p.id, token: p.token }; }
        if (S.phase !== 'lobby') return { error: 'Гра вже йде. Дочекайтеся наступної партії.' };
        if (!name) return { error: "Введіть ім'я" };
        if (players.length >= MAX_PLAYERS) return { error: `У кімнаті вже ${MAX_PLAYERS} гравців` };
        const np = addPlayer(name);
        if (!room.hostId && b.asHost) room.hostId = np.id;
        return { id: np.id, token: np.token };
      }
      case 'leave':
        if (!p) return {};
        if (S.phase === 'lobby') {
          players = players.filter(x => x.id !== id);
          if (room.hostId === id) room.hostId = players[0] ? players[0].id : null;
        } else leaveMidGame(p);
        return {};
      case 'ready':
        if (S.phase === 'roles' && p) { S.sub[id] = true; if (players.every(x => x.left || S.sub[x.id])) toNames(); }
        return {};
      case 'name': {
        const t = String(b.text || '').trim().slice(0, 40);
        if (S.phase === 'names' && p && t) { S.sub[id] = t; if (players.every(x => x.left || S.sub[x.id])) revealNames(); }
        return {};
      }
      case 'asked':
        if (S.phase === 'questions' && S.stage === 'ask' && S.order[S.idx] === id) nextAsk();
        return {};
      case 'draw':
        if (S.phase === 'drawing' && p && p.alive && typeof b.img === 'string' && b.img.startsWith('data:image/') && b.img.length < 6e5) {
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
      case 'emoji': {
        const e = onlyEmoji(b.text).slice(0, 3);
        if (S.phase === 'emoji' && p && p.alive && e.length === 3) { S.sub[id] = e.join(' '); if (alive().every(x => S.sub[x.id])) revealEmoji(); }
        return e.length === 3 ? {} : { error: 'Потрібно рівно 3 емодзі' };
      }
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
        if (S.phase === 'guess' && guessers().includes(id) && !S.skips[id] && t) { S.guess = t; S.guessBy = id; afterGuess(); }
        return {};
      }
      case 'skip':
        if (S.phase === 'guess' && guessers().includes(id)) {
          S.skips[id] = true;
          if (guessers().every(g => S.skips[g])) { S.guess = ''; afterGuess(); }
        }
        return {};
      case 'verdict':
        if (S.phase === 'verdict' && p && !isSpy(id)) {
          S.verdict[id] = !!b.yes;
          if (judges().filter(x => isOnline(x.id)).every(x => x.id in S.verdict)) finishVerdict();
        }
        return {};
      case 'word': {
        const w = String(b.text || '').trim().split(/\s+/)[0].slice(0, 24);
        if (S.phase === 'words' && p && p.alive && w) { S.sub[id] = w; if (alive().every(x => S.sub[x.id])) revealWords(); }
        return {};
      }
      // ведучий
      case 'start': case 'next': case 'lobby': case 'kick': {
        if (!isHost) return { error: 'Це може лише ведучий' };
        if (b.action === 'start') { const e = startGame(); return e ? { error: e } : {}; }
        if (b.action === 'next') { hostNext(); return {}; }
        if (b.action === 'lobby') { toLobby(); return {}; }
        if (S.phase === 'lobby' && b.target !== room.hostId) players = players.filter(x => x.id !== b.target);
        return {};
      }
    }
    return { error: 'Невідома дія' };
  }

  // ---------- що бачить кожен ----------
  function view(token, isScreenHost) {
    const ph = S.phase;
    const showChars = !['lobby', 'roles', 'names'].includes(ph);
    const p = byToken(token);
    const v = {
      code: room.code, phase: ph, now: Date.now(), endsAt: S.endsAt || 0, game: S.game || '',
      theme: ph === 'lobby' ? null : S.theme, hostId: room.hostId,
      spies: ph === 'lobby' ? (players.length >= TWO_SPIES_FROM ? 2 : 1) : S.spyIds.length, maxPlayers: MAX_PLAYERS,
      notice: S.notice || '', voteNo: S.voteNo || 1, extra: S.extra || null, extraNo: (S.extraIdx || 0) + 1,
      players: players.map(x => ({ id: x.id, name: x.name, alive: x.alive !== false, online: isOnline(x.id), char: showChars ? x.char : '' })),
      done: [],
    };
    if (['roles', 'names', 'drawing', 'words', 'emoji'].includes(ph)) v.done = Object.keys(S.sub || {});
    if (ph === 'vote') { v.done = Object.keys(S.votes); v.cands = S.cands; v.revote = !!S.revote; }
    if (ph === 'verdict') { v.done = Object.keys(S.verdict); v.guess = S.guess; v.guessBy = S.guessBy; }
    if (ph === 'emojiReveal') v.emojis = S.emojis;
    if (ph === 'questions' || ph === 'items') { v.order = S.order; v.idx = S.idx; v.stage = S.stage; v.target = S.target || null; }
    if (ph === 'items' || ph === 'itemsDone') v.items = S.items;
    if (ph === 'drawReveal') v.drawings = S.drawings;
    if (ph === 'voteResult') v.res = S.res;
    if (ph === 'wordsReveal') v.words = S.words;
    if (ph === 'end') v.end = { ...S.win, location: S.location, spyIds: S.spyIds, guess: S.guess || '', guessBy: S.guessBy || null, tally: S.win.reason === 'guessed' || S.win.reason === 'wrong' ? S.tally : null };

    const amHost = isScreenHost || (p && p.id === room.hostId);
    v.amHost = !!amHost;
    if (amHost) {
      v.lanUrls = lanUrls();
      // поточну локацію додаємо до пам'яті ведучого лише після кінця партії, щоб не світити її
      if (ph === 'roles' || ph === 'end') v.used = [...used].filter(k => ph === 'end' || k !== S.theme + '|' + S.location);
    }
    if (p) {
      const inGame = ph !== 'lobby';
      const amSpy = inGame && isSpy(p.id);
      v.me = {
        id: p.id, name: p.name, alive: p.alive !== false, isSpy: amSpy,
        partners: amSpy ? S.spyIds.filter(x => x !== p.id).map(nm) : [],
        canGuess: ph === 'guess' && amSpy && guessers().includes(p.id) && !S.skips[p.id],
        location: inGame && !amSpy ? S.location : null,
        mine: S.sub ? S.sub[p.id] || null : null,
        vote: S.votes ? S.votes[p.id] || null : null,
        verdict: S.verdict && p.id in S.verdict ? S.verdict[p.id] : null,
      };
      if (ph === 'drawing' && v.me.mine) v.me.mine = true;   // картинку назад не шлемо
    } else v.me = null;
    return v;
  }
  const send = c => c.res.write('data: ' + JSON.stringify(view(c.token, c.host)) + '\n\n');
  const broadcast = () => { for (const c of room.conns) { try { send(c); } catch (e) {} } };

  // якщо ведучий-гравець зник більш ніж на 20 с — ведучим стає наступний гравець онлайн
  function checkHost() {
    if (!room.hostId) return;
    if (isOnline(room.hostId)) { room.hostOffSince = 0; return; }
    if (!room.hostOffSince) { room.hostOffSince = Date.now(); return; }
    if (Date.now() - room.hostOffSince > 20000) {
      const next = players.find(x => x.id !== room.hostId && isOnline(x.id));
      if (next) { room.hostId = next.id; room.hostOffSince = 0; broadcast(); }
    }
  }

  Object.assign(room, {
    handle, view, send, broadcast, isOnline, byToken,
    tokenId: t => { const p = byToken(t); return p ? p.id : ''; },
    checkHost, stop: () => clearTimeout(timer),
  });
  rooms.set(room.code, room);
  return room;
}

setInterval(() => {
  for (const [code, r] of rooms) {
    r.checkHost();
    if (!r.conns.size && Date.now() - r.lastActive > 3 * 3600e3) { r.stop(); rooms.delete(code); }
  }
}, 5000);

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
        list.push({ score, url: `http://${a.address}:${PORT}/` });
      }
    }
  }
  list.sort((a, b) => b.score - a.score);
  return list.map(x => x.url);
}

setInterval(() => {
  for (const r of rooms.values()) for (const c of r.conns) { try { c.res.write('event: ping\ndata: 1\n\n'); } catch (e) {} }
}, 15000);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const ROUTES = { '/': 'play.html', '/play': 'play.html', '/play/': 'play.html', '/screen': 'screen.html', '/screen/': 'screen.html' };
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
    const c = { res, token: q('t'), host: q('key') === room.hostKey };
    const pid = room.tokenId(c.token);
    room.conns.add(c); room.lastActive = Date.now();
    if (pid) room.online.set(pid, (room.online.get(pid) || 0) + 1);
    room.broadcast();
    req.on('close', () => {
      room.conns.delete(c);
      if (pid) room.online.set(pid, Math.max(0, (room.online.get(pid) || 1) - 1));
      room.broadcast();
    });
    return;
  }

  if (req.method === 'GET' && u.pathname === '/state') {   // запасний режим: опитування замість SSE
    const room = getRoom(q('room'));
    if (!room) return json(res, { noRoom: true });
    room.lastActive = Date.now();
    const pid = room.tokenId(q('t'));
    if (pid) { const was = room.isOnline(pid); room.polled.set(pid, Date.now()); if (!was) setTimeout(room.broadcast, 0); }
    return json(res, room.view(q('t'), q('key') === room.hostKey));
  }

  if (req.method === 'GET' && u.pathname === '/exists') {
    const room = getRoom(q('room'));
    return json(res, { ok: !!room, host: !!room && room.hostKey === q('key'), player: !!room && !!room.tokenId(q('t')) });
  }

  if (req.method === 'POST' && u.pathname === '/api') {
    let body = '';
    req.on('data', d => { body += d; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      let b; try { b = JSON.parse(body || '{}'); } catch (e) { return json(res, { error: 'Помилка запиту' }); }
      if (b.action === 'create') {
        if (rooms.size >= MAX_ROOMS) return json(res, { error: 'Сервер переповнений, спробуйте пізніше' });
        const r = createRoom(b.used);
        const out = { room: r.code, key: r.hostKey };
        const name = String(b.name || '').trim();
        if (name) Object.assign(out, r.handle({ action: 'join', name, asHost: true }));   // ведучий-гравець
        return json(res, out);
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
  console.log(`  Відкрий: http://localhost:${PORT}`);
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
