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
const { THEMES, ITEMS, LOC_ITEMS, THEME_FIT } = require('./data');

const PORT = Number(process.env.PORT) || 3000;
const PUB = path.join(__dirname, 'public');
const MAX_PLAYERS = 12;
const TWO_SPIES_FROM = 7;   // з такої кількості гравців — 2 шпигуни
const MAX_ROOMS = 300;

// Знімок кімнати (зашифрований) лежить у браузерах гравців. Якщо сервер перезапустився
// (Render засинає або оновлюється), перший телефон, що під'єднався, відновлює кімнату з ним.
const SNAP_KEY = crypto.createHash('sha256').update('shpyhun:' + (process.env.SNAP_KEY || process.env.RENDER_SERVICE_ID || 'local')).digest();
function seal(obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', SNAP_KEY, iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj)), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
function unseal(str) {
  try {
    const b = Buffer.from(String(str), 'base64'), d = crypto.createDecipheriv('aes-256-gcm', SNAP_KEY, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString());
  } catch (e) { return null; }
}

// тривалість етапів, секунди
// дістає з тексту лише емодзі (з урахуванням складених, як 👨‍🍳 чи 🇺🇦)
const seg = new Intl.Segmenter('uk', { granularity: 'grapheme' });
function onlyEmoji(t) {
  return [...seg.segment(String(t || '').slice(0, 200))].map(x => x.segment).filter(g => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g));
}

const SEC = {
  roles: 45, nameTurn: 40,             // nameTurn — на одне ім'я (імена по колу)
  question: 120,                      // одне питання й відповідь (допит іде по колу)
  drawing: 70, itemPick: 25, explain: 120,
  vote: 45, guess: 30, verdict: 45, words: 40, emoji: 120,
  scene: 100, review: 50, auction: 90,
  // показ результатів (ведучий може натиснути «Далі» раніше)
  namesReveal: 25, drawReveal: 45, itemsDone: 15, voteResult: 12, wordsReveal: 25, emojiReveal: 30, sceneReveal: 45, reviewReveal: 50, auctionReveal: 50,
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

function createRoom(usedInit, code) {
  const room = {
    code: code || newCode(), hostKey: rid(16), hostId: null,
    conns: new Set(), online: new Map(), polled: new Map(), lastActive: Date.now(), hostOffSince: 0,
    settings: { drawing: true, items: true, scene: true, emoji: true, review: true, auction: true, pace: 1, remote: false },   // налаштування ведучого в лобі
    chat: [], chatSeq: 0, chatAt: new Map(), lastRounds: [],   // чат кімнати (останні 80 повідомлень)
    history: [],                                                 // архів партій кімнати (останні 30)
  };
  // темп впливає на ігрові етапи, а не на показ результатів і не на 30 с шпигуна
  const PACED = ['nameTurn', 'question', 'drawing', 'itemPick', 'explain', 'emoji', 'words', 'vote', 'scene', 'review', 'auction'];
  const T = k => Math.round(SEC[k] * (PACED.includes(k) ? room.settings.pace : 1));

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
    setTimer(T('roles'), toNames);
    return null;
  }

  // імена по колу: кожен бачить імена тих, хто вже назвався
  function toNames() {
    S.phase = 'names'; S.sub = {};
    S.order = shuffle(players.filter(p => !p.left).map(p => p.id)); S.idx = 0;
    setTimer(T('nameTurn'), nextName);
  }
  function nextName() {
    const cur = S.order[S.idx];
    if (cur && !S.sub[cur]) S.sub[cur] = '(без імені)';
    S.idx++;
    if (S.idx >= S.order.length) return revealNames();
    setTimer(T('nameTurn'), nextName);
  }
  function revealNames() {
    players.forEach(p => { p.char = S.sub[p.id] || '(без імені)'; });
    S.sub = {}; S.phase = 'namesReveal';
    setTimer(T('namesReveal'), afterNames);
  }

  // допит по колу: кожен питає наступного, останній — першого
  function toQuestions() { S.phase = 'questions'; S.order = shuffle(alive().map(p => p.id)); S.idx = 0; startAsk(); }
  function startAsk() { S.qa = { q: '', a: '' }; S.stage = 'ask'; S.target = S.order[(S.idx + 1) % S.order.length]; setTimer(T('question'), nextAsk); }
  function questionsTimeout() { nextAsk(); }
  function nextAsk() { S.idx++; if (S.idx >= S.order.length) startSlot(1); else startAsk(); }

  // після допиту — малювання або предмети, по черзі між партіями; потім емодзі.
  // Черговість рахуємо від кількості зіграних локацій (її пам'ятає браузер ведучого),
  // тож вона не збивається, навіть якщо кімнату створили заново чи сервер перезапустився.
  // Додаткові раунди: щогри випадково 2 різні з увімкнених — один після імен, другий перед голосуванням.
  // Раунди з минулої партії по змозі не повторюються.
  const ROUNDS = ['drawing', 'items', 'scene', 'emoji', 'review', 'auction'];
  // вага раунду для теми (THEME_FIT): підходящі випадають частіше, вага 0 — ніколи.
  // Раунди минулої партії не повторюються, поки є з чого обрати інші.
  function pickRounds() {
    const on = ROUNDS.filter(k => room.settings[k] !== false);
    const fit = (THEME_FIT[S.theme] || ['', {}])[1];
    const weighted = list => list.map(k => ({ k, w: k in fit ? fit[k] : 1 })).filter(x => x.w > 0);
    const draw = (pool, n) => { const out = []; pool = pool.slice();
      while (out.length < n && pool.length) {
        let r = Math.random() * pool.reduce((a, x) => a + x.w, 0);
        const i = Math.max(0, pool.findIndex(x => (r -= x.w) < 0));
        out.push(pool.splice(i, 1)[0].k);
      }
      return out; };
    // спершу свіжі підходящі, потім (якщо не вистачило) — підходящі з минулої партії, і лише в крайньому разі — непідходящі
    const pick = draw(weighted(on.filter(k => !room.lastRounds.includes(k))), 2);
    if (pick.length < 2) pick.push(...draw(weighted(on.filter(k => room.lastRounds.includes(k))), 2 - pick.length));
    if (pick.length < 2) pick.push(...draw(on.filter(k => !pick.includes(k)).map(k => ({ k, w: 1 })), 2 - pick.length));
    room.lastRounds = pick;
    return pick.length === 1 ? [null, pick[0]] : pick;   // один раунд — ставимо перед голосуванням
  }
  function afterNames() { S.slots = pickRounds(); startSlot(0); }
  function startSlot(i) {
    S.slot = i;
    const k = (S.slots || [])[i];
    if (!k) return i === 0 ? toQuestions() : toVote();
    S.extra = k;
    if (k === 'emoji') toEmoji(); else if (k === 'review') toReview(); else if (k === 'auction') toAuction(); else startExtra();
  }
  function roundDone() { if (S.slot === 0) toQuestions(); else toVote(); }

  // сцена: 20 наліпок-емодзі (до 12 від локацій теми + випадкові), ставиш 1–5, крутиш, збільшуєш, домальовуєш
  function toScene() {
    const themed = (THEMES[S.theme] || []).flatMap(l => (LOC_ITEMS[l] || []).map(x => x[0]));
    const seen = new Set(themed);
    const extra = shuffle(ITEMS.map(x => x[0]).filter(e => !seen.has(e) && (seen.add(e), true)));
    S.stickers = shuffle([...new Set(themed)].concat(extra).slice(0, 20));
    S.phase = 'scene'; S.sub = {}; setTimer(T('scene'), revealScene);
  }
  function revealScene() { S.scenes = { ...S.sub }; S.sub = {}; S.phase = 'sceneReveal'; setTimer(T('sceneReveal'), roundDone); }


  // емодзі: кожен за 2 хвилини вводить 3 емодзі про локацію, потім показуємо всім
  function toEmoji() { S.phase = 'emoji'; S.sub = {}; setTimer(T('emoji'), revealEmoji); }
  function revealEmoji() { S.emojis = { ...S.sub }; S.sub = {}; S.phase = 'emojiReveal'; setTimer(T('emojiReveal'), roundDone); }
  // відгук: кожен пише короткий відгук на локацію (не називаючи її) і ставить зірки
  function toReview() { S.phase = 'review'; S.sub = {}; setTimer(T('review'), revealReview); }
  function revealReview() { S.reviews = { ...S.sub }; S.sub = {}; S.phase = 'reviewReveal'; setTimer(T('reviewReveal'), roundDone); }

  // аукціон: 100 монет на 6 предметів (2 справжні від локації + 4 від інших локацій теми), ставки таємні до показу
  function toAuction() {
    const mine = (LOC_ITEMS[S.location] || []).slice(0, 2);
    const seen = new Set(mine.map(x => x[1]));
    const others = shuffle((THEMES[S.theme] || []).filter(l => l !== S.location).flatMap(l => LOC_ITEMS[l] || [])).filter(x => !seen.has(x[1]) && (seen.add(x[1]), true));
    const pool = mine.concat(others.slice(0, 6 - mine.length));
    if (pool.length < 6) pool.push(...shuffle(ITEMS.filter(x => !seen.has(x[1]))).slice(0, 6 - pool.length));
    S.lots = shuffle(pool).map(([e, n]) => ({ e, n }));
    S.phase = 'auction'; S.sub = {}; setTimer(T('auction'), revealAuction);
  }
  function revealAuction() { S.bids = { ...S.sub }; S.sub = {}; S.phase = 'auctionReveal'; setTimer(T('auctionReveal'), roundDone); }
  function startExtra() {
    if (S.extra === 'drawing') { S.phase = 'drawing'; S.sub = {}; setTimer(T('drawing'), revealDrawings); }
    else if (S.extra === 'scene') toScene();
    else {
      S.phase = 'items';
      // 12 предметів: 2 від справжньої локації, 7 від інших локацій теми, 3 випадкові —
      // пов'язані з місцем, але не видають, з яким саме
      const mine = LOC_ITEMS[S.location] || [];
      const others = shuffle((THEMES[S.theme] || []).filter(l => l !== S.location).flatMap(l => LOC_ITEMS[l] || []));
      const seen = new Set(mine.map(x => x[1]));
      const themed = mine.concat(others.filter(x => !seen.has(x[1]) && (seen.add(x[1]), true)).slice(0, 7));
      const extra = shuffle(ITEMS.filter(x => !seen.has(x[1]))).slice(0, Math.max(0, 12 - themed.length));
      S.items = shuffle(themed.concat(extra)).slice(0, 12).map(([e, n]) => ({ e, n, by: null }));
      S.order = shuffle(alive().map(p => p.id)); S.idx = 0;
      startPick();
    }
  }
  function revealDrawings() { S.drawings = { ...S.sub }; S.sub = {}; S.phase = 'drawReveal'; setTimer(T('drawReveal'), roundDone); }
  function startPick() { S.stage = 'pick'; setTimer(T('itemPick'), itemsTimeout); }
  function startExplain() { S.stage = 'explain'; setTimer(T('explain'), itemsTimeout); }
  function itemsTimeout() {
    if (S.stage === 'pick') { pickOne(S.items.filter(i => !i.by)).by = S.order[S.idx]; startExplain(); }
    else nextItem();
  }
  function nextItem() { S.idx++; if (S.idx >= S.order.length) { S.phase = 'itemsDone'; setTimer(T('itemsDone'), roundDone); } else startPick(); }

  function toVote(cands) {
    if (!cands) { S.revote = false; S.notice = ''; }
    S.phase = 'vote'; S.votes = {}; S.cands = cands || null;
    setTimer(T('vote'), tally);
  }
  function tally() {
    clearTimer();
    const counts = {};
    for (const t of Object.values(S.votes)) counts[t] = (counts[t] || 0) + 1;
    const max = Math.max(0, ...Object.values(counts));
    const top = max ? Object.keys(counts).filter(k => counts[k] === max) : [];
    let out = null;
    (S.voteLog = S.voteLog || []).push({ no: S.voteNo, revote: !!S.revote, votes: { ...S.votes }, out: top.length === 1 ? top[0] : null });
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
    setTimer(T('voteResult'), toGuess);
  }

  const isSpy = id => !!S.spyIds && S.spyIds.includes(id);
  // хто зі шпигунів може зараз назвати локацію: живі + щойно вигнаний
  const guessers = () => S.spyIds.filter(id => { const x = byId(id); return x && (x.alive || (S.res && S.res.out === id)); });
  // Кожен шпигун може окремо назвати локацію. Здогадки мирні оцінюють по черзі:
  // вгадав — шпигуни перемогли; помилився — вибуває лише той, хто помилився.
  function toGuess() { S.phase = 'guess'; S.guess = ''; S.guessBy = null; S.skips = {}; S.pending = {}; S.wrong = []; setTimer(T('guess'), afterGuess); }
  const guessDone = () => guessers().every(g => S.skips[g] || S.pending[g]);
  function afterGuess() { S.queue = Object.entries(S.pending).map(([by, text]) => ({ by, text })); S.pending = {}; nextVerdict(); }
  function nextVerdict() {
    const g = S.queue.shift();
    if (!g) return resolveNoGuess();
    S.guess = g.text; S.guessBy = g.by; S.phase = 'verdict'; S.verdict = {};
    setTimer(T('verdict'), finishVerdict);
  }
  const judges = () => players.filter(p => !isSpy(p.id));
  function finishVerdict() {
    const v = Object.values(S.verdict);
    const yes = v.filter(Boolean).length, no = v.length - yes;
    S.tally = { yes, no };
    // більшість тих, хто проголосував; при нічиї — на користь шпигуна
    if (yes > 0 && yes >= no) return endGame('spy', 'guessed');
    const p = byId(S.guessBy); if (p) p.alive = false;
    S.wrong.push({ by: S.guessBy, guess: S.guess, tally: S.tally });
    nextVerdict();
  }
  function resolveNoGuess() {
    const out = S.res && S.res.out;
    const spiesLeft = S.spyIds.filter(id => byId(id) && byId(id).alive).length;
    const last = S.wrong && S.wrong[S.wrong.length - 1];
    if (last) { S.guess = last.guess; S.guessBy = last.by; S.tally = last.tally; }
    if (!spiesLeft) return endGame('town', last ? 'wrong' : 'caught');
    if (alive().length - spiesLeft <= spiesLeft) return endGame('spy', 'fewLeft');
    const maxVotes = S.spyIds.length > 1 ? 3 : 2;   // з двома шпигунами — до 3 голосувань
    if (S.voteNo >= maxVotes) return endGame('spy', 'survived');
    S.voteNo++;
    const parts = [!out ? 'Нікого не вигнали' : isSpy(out) ? `${nm(out)} — шпигун!${spiesLeft ? ' Але серед вас є ще один' : ''}` : `${nm(out)} — не шпигун`];
    for (const w of S.wrong || []) if (w.by !== out) parts.push(`${nm(w.by)} — шпигун, помилився з локацією й вибуває`);
    S.guess = ''; S.guessBy = null; S.tally = null;
    if (S.voteNo === 3) {
      // перед третім голосуванням — ще один випадковий раунд, якого не було в цій партії
      const left = shuffle(ROUNDS.filter(k => room.settings[k] && !(S.slots || []).includes(k)));
      if (left.length) { S.slots = (S.slots || [null, null]).slice(0, 2).concat(left[0]); startSlot(2); S.notice = parts.join('. '); return; }
    }
    toWords();
    S.notice = parts.join('. ');
  }

  function toWords() { S.phase = 'words'; S.sub = {}; setTimer(T('words'), revealWords); }
  function revealWords() { S.words = { ...S.sub }; S.sub = {}; S.phase = 'wordsReveal'; setTimer(T('wordsReveal'), () => toVote()); }

  // рахунок між партіями: перемога шпигуна — +2 кожному шпигуну, перемога мирних — +1 кожному мирному
  function endGame(winner, reason) {
    clearTimer(); S.phase = 'end';
    const gain = {};
    for (const p of players) if (!p.left && isSpy(p.id) === (winner === 'spy')) { gain[p.id] = winner === 'spy' ? 2 : 1; p.score = (p.score || 0) + gain[p.id]; }
    S.win = { winner, reason, gain };
    // архів номерів: що це була за партія
    const nm = id => { const p = byId(id); return p ? p.name : '?'; };
    room.history.unshift({ n: (room.history[0] ? room.history[0].n : 0) + 1, theme: S.theme, loc: S.location, spies: S.spyIds.map(nm), winner, reason,
      guess: S.guess || '', guessBy: S.guessBy ? nm(S.guessBy) : '', out: (S.voteLog || []).filter(r => r.out).map(r => nm(r.out)), rounds: (S.slots || []).filter(Boolean), players: players.filter(p => !p.left).length, at: Date.now() });
    room.history = room.history.slice(0, 30);
  }
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
          if (i === S.idx || wasTarget) { if (S.idx >= S.order.length) startSlot(1); else startAsk(); }
        } else if (i === S.idx) { S.idx--; nextItem(); }
      }
    }
    if (S.votes) for (const [k, t] of Object.entries(S.votes)) if (k === id || t === id) delete S.votes[k];
    if (S.cands) S.cands = S.cands.filter(x => x !== id);
    S.notice = (S.notice ? S.notice + " " : "") + `${who} вийшов із гри.`;
    switch (S.phase) {
      case 'roles': if (here.every(x => S.sub[x.id])) toNames(); break;
      case 'names': {
        const i = S.order.indexOf(id);
        if (i >= 0) { S.order.splice(i, 1); if (i < S.idx) S.idx--; else if (i === S.idx) { S.idx--; nextName(); } }
        break;
      }
      case 'drawing': if (alive().every(x => S.sub[x.id])) revealDrawings(); break;
      case 'words': if (alive().every(x => S.sub[x.id])) revealWords(); break;
      case 'emoji': if (alive().every(x => S.sub[x.id])) revealEmoji(); break;
      case 'review': if (alive().every(x => S.sub[x.id])) revealReview(); break;
      case 'auction': if (alive().every(x => S.sub[x.id])) revealAuction(); break;
      case 'scene': if (alive().every(x => S.sub[x.id])) revealScene(); break;
      case 'vote': if (alive().every(x => S.votes[x.id])) tally(); break;
      case 'verdict': if (judges().filter(x => isOnline(x.id)).every(x => x.id in S.verdict)) finishVerdict(); break;
    }
  }

  // «Далі» / «Не чекати» від ведучого
  function hostNext() {
    switch (S.phase) {
      case 'roles': return toNames();
      case 'names': return nextName();
      case 'namesReveal': return afterNames();
      case 'questions': return questionsTimeout();
      case 'drawing': return revealDrawings();
      case 'drawReveal': return roundDone();
      case 'items': return itemsTimeout();
      case 'itemsDone': return roundDone();
      case 'emoji': return revealEmoji();
      case 'emojiReveal': return roundDone();
      case 'review': return revealReview();
      case 'reviewReveal': return roundDone();
      case 'auction': return revealAuction();
      case 'auctionReveal': return roundDone();
      case 'scene': return revealScene();
      case 'sceneReveal': return roundDone();
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
        if (S.phase === 'names' && t && S.order[S.idx] === id && !S.sub[id]) { S.sub[id] = t; nextName(); }
        return {};
      }
      // ---- чат і текстові відповіді (гра на відстані) ----
      case 'chat': {
        const t = String(b.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
        if (!p || !t) return {};
        if (Date.now() - (room.chatAt.get(id) || 0) < 700) return { error: 'Не так швидко 🙂' };
        room.chatAt.set(id, Date.now());
        const showChar = !['lobby', 'roles', 'names'].includes(S.phase) && p.char;
        room.chat.push({ i: ++room.chatSeq, from: id, who: showChar ? p.char : p.name, text: t, t: Date.now() });
        if (room.chat.length > 80) room.chat.splice(0, room.chat.length - 80);
        return {};
      }
      case 'askText': {   // той, хто питає, пише питання
        const t = String(b.text || '').trim().slice(0, 200);
        if (S.phase === 'questions' && S.order[S.idx] === id && t && !S.qa.q) S.qa.q = t;
        return {};
      }
      case 'answerText': {   // той, кого питають, пише відповідь — потім 8 с, щоб усі прочитали
        const t = String(b.text || '').trim().slice(0, 200);
        if (S.phase === 'questions' && S.target === id && S.qa.q && t && !S.qa.a) { S.qa.a = t; setTimer(8, nextAsk); }
        return {};
      }
      case 'explainText': {   // пояснення до предмета текстом
        const t = String(b.text || '').trim().slice(0, 240);
        const it = S.phase === 'items' && S.stage === 'explain' && S.order[S.idx] === id && S.items.find(x => x.by === id);
        if (it && t && !it.txt) { it.txt = t; setTimer(8, nextItem); }
        return {};
      }
      case 'asked':
        if (S.phase === 'questions' && S.stage === 'ask' && S.order[S.idx] === id) nextAsk();
        return {};
      case 'scene':
        if (S.phase === 'scene' && p && p.alive && typeof b.img === 'string' && b.img.startsWith('data:image/') && b.img.length < 6e5) {
          S.sub[id] = b.img;
          if (alive().every(x => S.sub[x.id])) revealScene();
        }
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
      case 'review': {
        const t = String(b.text || '').trim().slice(0, 140), st = Math.round(+b.stars);
        if (S.phase !== 'review' || !p || !p.alive) return {};
        if (!t || !(st >= 1 && st <= 5)) return { error: 'Напиши відгук і постав зірки' };
        S.sub[id] = { t, s: st };
        if (alive().every(x => S.sub[x.id])) revealReview();
        return {};
      }
      case 'bid': {
        const bids = Array.isArray(b.bids) ? b.bids.map(x => Math.max(0, Math.floor(+x) || 0)) : [];
        if (S.phase !== 'auction' || !p || !p.alive || S.sub[id]) return {};
        if (bids.length !== 6 || bids.reduce((a, x) => a + x, 0) !== 100) return { error: 'Розподіли рівно 100 монет' };
        S.sub[id] = bids;
        if (alive().every(x => S.sub[x.id])) revealAuction();
        return {};
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
        if (S.phase === 'guess' && guessers().includes(id) && !S.skips[id] && !S.pending[id] && t) { S.pending[id] = t; if (guessDone()) afterGuess(); }
        return {};
      }
      case 'skip':
        if (S.phase === 'guess' && guessers().includes(id)) {
          S.skips[id] = true;
          if (guessDone()) afterGuess();
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
      case 'start': case 'next': case 'lobby': case 'kick': case 'settings': case 'resetScore': {
        if (!isHost) return { error: 'Це може лише ведучий' };
        if (b.action === 'settings') {
          if (S.phase !== 'lobby' && S.phase !== 'end') return { error: 'Налаштування — лише між партіями' };
          const n = b.settings || {}, st = room.settings;
          for (const k of ['drawing', 'items', 'scene', 'emoji', 'review', 'auction', 'remote']) if (typeof n[k] === 'boolean') st[k] = n[k];
          if ([0.67, 1, 1.5].includes(n.pace)) st.pace = n.pace;
          return {};
        }
        if (b.action === 'resetScore') { players.forEach(x => { x.score = 0; }); return {}; }
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
      notice: S.notice || '', voteNo: S.voteNo || 1, extra: S.extra || null, slots: S.slots || null,
      players: players.map(x => ({ id: x.id, name: x.name, alive: x.alive !== false, online: isOnline(x.id), char: showChars ? x.char : '', score: x.score || 0 })),
      settings: room.settings,
      done: [],
    };
    if (['roles', 'names', 'drawing', 'words', 'emoji', 'scene', 'review', 'auction'].includes(ph)) v.done = Object.keys(S.sub || {});
    if (ph === 'scene') v.stickers = S.stickers;
    if (ph === 'sceneReveal') v.scenes = S.scenes;
    if (ph === 'vote') { v.done = Object.keys(S.votes); v.cands = S.cands; v.revote = !!S.revote; }
    if (ph === 'guess') v.done = guessers().filter(g => S.skips[g] || S.pending[g]);
    if (ph === 'verdict') { v.done = Object.keys(S.verdict); v.guess = S.guess; v.guessBy = S.guessBy; }
    if (ph === 'emojiReveal') v.emojis = S.emojis;
    if (ph === 'reviewReveal') v.reviews = S.reviews;
    if (ph === 'auction' || ph === 'auctionReveal') v.lots = S.lots;
    if (ph === 'auctionReveal') v.bids = S.bids;
    if (ph === 'names') { v.order = S.order; v.idx = S.idx; v.named = S.sub; }
    if (ph === 'questions') v.qa = S.qa || { q: '', a: '' };
    v.chat = room.chat;
    if (ph === 'questions' || ph === 'items') { v.order = S.order; v.idx = S.idx; v.stage = S.stage; v.target = S.target || null; }
    if (ph === 'items' || ph === 'itemsDone') v.items = S.items;
    if (ph === 'drawReveal') v.drawings = S.drawings;
    if (ph === 'voteResult') v.res = S.res;
    if (ph === 'wordsReveal') v.words = S.words;
    if (ph === 'lobby' || ph === 'end') v.history = room.history;
    if (ph === 'end') v.end = { ...S.win, votes: S.voteLog || [], location: S.location, spyIds: S.spyIds, guess: S.guess || '', guessBy: S.guessBy || null, tally: S.win.reason === 'guessed' || S.win.reason === 'wrong' ? S.tally : null };

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
        canGuess: ph === 'guess' && amSpy && guessers().includes(p.id) && !S.skips[p.id] && !(S.pending || {})[p.id],
        guessed: ph === 'guess' && amSpy ? (S.pending || {})[p.id] || null : null,
        partnerIn: amSpy && S.spyIds.some(x => x !== p.id && byId(x) && byId(x).alive),
        location: inGame && !amSpy ? S.location : null,
        mine: S.sub ? S.sub[p.id] || null : null,
        vote: S.votes ? S.votes[p.id] || null : null,
        verdict: S.verdict && p.id in S.verdict ? S.verdict[p.id] : null,
      };
      if ((ph === 'drawing' || ph === 'scene') && v.me.mine) v.me.mine = true;   // картинку назад не шлемо
    } else v.me = null;
    return v;
  }
  // ---------- знімок для відновлення після перезапуску сервера ----------
  function snapshot() {
    const s = { ...S };
    if (s.phase === 'drawing' || s.phase === 'scene') s.sub = {};
    delete s.drawings; delete s.scenes;                                   // малюнки важкі — їх не зберігаємо
    return { code: room.code, hostKey: room.hostKey, hostId: room.hostId, settings: room.settings, chat: room.chat, chatSeq: room.chatSeq, lastRounds: room.lastRounds, history: room.history, players, S: s, used: [...used], lastTheme, t: Date.now() };
  }
  const TIMEOUT = {
    roles: toNames, names: nextName, namesReveal: afterNames, questions: nextAsk,
    drawing: revealDrawings, drawReveal: roundDone, items: itemsTimeout, itemsDone: roundDone,
    emoji: revealEmoji, emojiReveal: roundDone,
    review: revealReview, reviewReveal: roundDone, auction: revealAuction, auctionReveal: roundDone,
    scene: revealScene, sceneReveal: roundDone,
    vote: tally, voteResult: toGuess,
    guess: afterGuess, verdict: finishVerdict, words: revealWords, wordsReveal: () => toVote(),
  };
  function restore(d) {
    room.hostKey = d.hostKey; room.hostId = d.hostId; lastTheme = d.lastTheme; if (d.settings) room.settings = { ...room.settings, ...d.settings }; if (d.chat) { room.chat = d.chat; room.chatSeq = d.chatSeq || 0; } room.lastRounds = d.lastRounds || []; room.history = d.history || [];
    players = d.players; S = d.S;
    if (S.phase === 'drawReveal') S.drawings = {};
    if (S.phase === 'sceneReveal') S.scenes = {};
    const fn = TIMEOUT[S.phase];
    if (fn && S.endsAt) setTimer(Math.max(15, (S.endsAt - d.t) / 1000 + 10), fn);   // +10 с на перепідключення
    else S.endsAt = 0;
  }
  let snapCache = '', snapAt = 0;
  const snap = () => { if (Date.now() - snapAt > 300) { snapCache = seal(snapshot()); snapAt = Date.now(); } return snapCache; };
  const send = c => { const v = view(c.token, c.host); v.snap = snap(); c.res.write('data: ' + JSON.stringify(v) + '\n\n'); };
  const broadcast = () => { snapAt = 0; for (const c of room.conns) { try { send(c); } catch (e) {} } };

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
    handle, view, send, broadcast, isOnline, byToken, restore, snap,
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
    return json(res, { ...room.view(q('t'), q('key') === room.hostKey), snap: room.snap() });
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
      if (b.action === 'restore') {
        if (getRoom(b.room)) return json(res, { ok: true });
        const d = unseal(b.snap);
        if (!d || d.code !== String(b.room || '').toUpperCase() || Date.now() - d.t > 3 * 3600e3) return json(res, { error: 'Не вдалося відновити кімнату', noRoom: true });
        const r = createRoom(d.used, d.code);
        try { r.restore(d); } catch (e) { console.error(e); rooms.delete(d.code); return json(res, { error: 'Не вдалося відновити кімнату', noRoom: true }); }
        console.log('Кімнату відновлено:', d.code);
        return json(res, { ok: true });
      }
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
