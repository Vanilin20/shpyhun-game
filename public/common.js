// ===== Шпигун — спільне для телефона і великого екрана =====
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

// колір аватара з імені
function hueOf(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) % 360; return h; }
// ім'я в грі: після раунду імен — ім'я персонажа, до того — справжнє
const dn = p => (p && (p.char || p.name)) || '?';
function av(p, cls = '') {
  const n = (p && p.name) || '?', shown = dn(p);
  return `<span class="av ${cls}" style="--h:${hueOf(n)}">${esc([...shown.trim()][0] || '?').toUpperCase()}</span>`;
}

// ---------- зв'язок із сервером: SSE, а якщо проксі його гальмує — опитування ----------
function Live({ room, token = '', key = '', onState, onNoRoom }) {
  let es = null, poll = null, lastAct = 0, got = false, startedAt = Date.now(), dead = false, restoring = false, tries = 0;
  const qs = `room=${encodeURIComponent(room)}&t=${encodeURIComponent(token)}&key=${encodeURIComponent(key)}`;
  const SK = 'spy_snap_' + String(room).toUpperCase();
  const lost = on => document.body.classList.toggle('reconnecting', on);
  const handle = v => {
    got = true; lastAct = Date.now(); lost(false);
    if (v.noRoom) return noRoom();
    if (v.snap) { try { localStorage.setItem(SK, v.snap); } catch (e) {} delete v.snap; }
    tries = 0;
    onState(v);
  };
  // кімнати нема: якщо є знімок — сервер, мабуть, перезапустився; відновлюємо
  function noRoom() {
    let snap = null; try { snap = localStorage.getItem(SK); } catch (e) {}
    if (!snap || tries >= 4) { try { localStorage.removeItem(SK); } catch (e) {} stop(); onNoRoom && onNoRoom(); return; }
    if (restoring) return;
    restoring = true; tries++; lost(true);
    if (es) { es.close(); es = null; }
    postApi({ action: 'restore', room, snap }).then(r => {
      restoring = false;
      if (r && r.noRoom) { tries = 99; return noRoom(); }
      setTimeout(() => { if (!dead && !poll) open(); }, r && r.ok ? 0 : 3000);
    });
  }
  const pollOnce = () => fetch('/state?' + qs, { cache: 'no-store' }).then(r => r.json()).then(handle).catch(() => {});
  function startPoll() { if (es) { es.close(); es = null; } if (!poll) { poll = setInterval(pollOnce, 1500); pollOnce(); } }
  function open() {
    if (dead) return;
    es = new EventSource('/events?' + qs);
    es.onmessage = e => handle(JSON.parse(e.data));
    es.addEventListener('ping', () => { lastAct = Date.now(); lost(false); });
  }
  const watchdog = setInterval(() => {
    if (dead) return;
    if (got && Date.now() - lastAct > 20000) lost(true);
    if (poll) return;
    if ((!got && Date.now() - startedAt > 6000) || (got && Date.now() - lastAct > 40000)) startPoll();
  }, 2000);
  // Render присипляє сервер, якщо до нього довго ніхто не звертається — легенько «будимо»
  const keepAwake = setInterval(() => fetch('/exists?room=' + encodeURIComponent(room), { cache: 'no-store' }).catch(() => {}), 4 * 60e3);
  function stop() { dead = true; lost(false); if (es) es.close(); if (poll) clearInterval(poll); clearInterval(watchdog); clearInterval(keepAwake); }
  open();
  return { stop, refresh: () => { if (poll) pollOnce(); }, forget: () => { try { localStorage.removeItem(SK); } catch (e) {} } };
}

async function postApi(body) {
  try {
    const r = await fetch('/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await r.json();
  } catch (e) { return { error: "Немає зв'язку з сервером. Перевір інтернет." }; }
}

// ---------- таймер-кільце ----------
const Timer = (() => {
  let total = 0, lastEnds = 0, off = 0, ends = 0, lastSec = -1, upDone = false;
  function set(st) {
    off = st.now - Date.now();
    // фаза змінилась, коли старий таймер майже добіг кінця — значить, час вийшов
    if (st.endsAt !== lastEnds) { if (lastSec >= 0 && lastSec <= 1 && !upDone) Sound.timeUp(); upDone = false; lastEnds = st.endsAt; lastSec = -1; ends = st.endsAt; total = st.endsAt ? Math.max(1, st.endsAt - st.now) : 0; }
  }
  function left() { return ends ? Math.max(0, ends - Date.now() - off) : null; }
  function html() { return `<div class="ring" id="ring" hidden><svg viewBox="0 0 46 46"><circle class="bg" cx="23" cy="23" r="20"/><circle class="fg" cx="23" cy="23" r="20" stroke-dasharray="125.66" stroke-dashoffset="0"/></svg><span></span></div>`; }
  function tick() {
    const el = $('#ring'); if (!el) return;
    const l = left();
    el.hidden = l == null;
    if (l == null) return;
    const s = Math.ceil(l / 1000);
    if (s !== lastSec) {
      if (s > 0 && s <= 3 && lastSec > s) Sound.tick();
      if (s === 0 && lastSec > 0 && !upDone) { upDone = true; Sound.timeUp(); }
      lastSec = s;
    }
    el.querySelector('span').textContent = s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : s;
    el.querySelector('.fg').style.strokeDashoffset = 125.66 * (1 - (total ? l / total : 0));
    el.classList.toggle('low', s <= 10);
  }
  setInterval(tick, 250);
  return { set, html, tick, left };
})();

// ---------- QR ----------
function qrSvg(text) {
  try { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 6, margin: 16, scalable: true }); } catch (e) { return ''; }
}

const REASON = {
  caught: 'Усіх шпигунів вигнали, а локацію вони не назвали',
  wrong: 'Шпигун назвав неправильну локацію',
  guessed: 'Шпигун вгадав локацію!',
  survived: 'Шпигун вцілів після обох голосувань',
  fewLeft: 'Мирних лишилося не більше, ніж шпигунів',
};
const PHASE_NAME = {
  roles: 'Досьє', names: 'Імена', namesReveal: 'Імена', questions: 'Допит', drawing: 'Малювання', drawReveal: 'Галерея',
  items: 'Предмети', itemsDone: 'Предмети', emoji: 'Емодзі', emojiReveal: 'Емодзі', vote: 'Голосування', voteResult: 'Вирок', guess: 'Шанс шпигуна', verdict: 'Здогадка',
  words: 'Одне слово', wordsReveal: 'Слова', end: 'Справу закрито',
};
const rot = i => `--rot:${[-2.2, 1.6, -1, 2.4, -1.8, 1.1, -2.6, 1.9][i % 8]}deg`;

// ---------- спільні блоки ----------
const R = {
  P(st, id) { return st.players.find(p => p.id === id) || { name: '?', char: '' }; },
  alive(st) { return st.players.filter(p => p.alive); },
  phaseTag(st, text) { return `<div class="phase-tag"><span class="dot"></span><span class="label">${esc(text || PHASE_NAME[st.phase] || '')}</span></div>`; },

  names(st) {
    return `<div class="cards">${st.players.map((p, i) => `
      <div class="card" style="animation-delay:${i * .1}s"><div class="paper" style="${rot(i)}">
        <div class="who">${av(p)}${esc(p.name)}</div><div class="big">${esc(p.char)}</div></div></div>`).join('')}</div>`;
  },
  words(st, field = 'words', cls = '') {
    return `<div class="cards">${R.alive(st).map((p, i) => `
      <div class="card" style="animation-delay:${i * .12}s"><div class="paper" style="${rot(i)}">
        <div class="who">${av(p)}${esc(p.char || p.name)}</div>${cls === 'emo' ? `<div class="emo-row">${((st[field] || {})[p.id] || '').split(' ').filter(Boolean).map(e => `<span>${esc(e)}</span>`).join('') || '—'}</div>` : `<div class="big">${esc((st[field] || {})[p.id] || '—')}</div>`}</div></div>`).join('')}</div>`;
  },
  gallery(st) {
    return `<div class="gallery">${R.alive(st).map((p, i) => {
      const img = st.drawings && st.drawings[p.id];
      return `<div class="polaroid" style="${rot(i)};animation-delay:${i * .15}s" ${img ? `data-zoom="${i}"` : ''}>
        ${img ? `<img src="${img}" alt="Малюнок: ${esc(p.char || p.name)}">` : '<div class="none">🙈</div>'}
        <div class="cap">${av(p)}${esc(p.char || p.name)}</div></div>`;
    }).join('')}</div>`;
  },
  bindZoom(root) {
    root.querySelectorAll('[data-zoom]').forEach(el => el.onclick = () => {
      const src = el.querySelector('img').src;
      const z = document.createElement('div'); z.className = 'zoom'; z.innerHTML = `<img src="${src}" alt="">`;
      z.onclick = () => z.remove(); document.body.appendChild(z);
    });
  },
  items(st, { pickable = false, current = -1 } = {}) {
    return `<div class="items">${st.items.map((it, i) => {
      const owner = it.by ? R.P(st, it.by) : null;
      const tag = pickable && !it.by ? 'button' : 'div';
      return `<${tag} class="item ${it.by ? 'taken' : ''} ${i === current ? 'now' : ''} ${pickable && it.by ? 'dead' : ''}" style="animation-delay:${i * .04}s"
        ${tag === 'button' ? `data-pick="${i}"` : ''}>
        <span class="e">${it.e}</span><span>${esc(it.n)}</span>
        ${owner ? `<span class="by">${av(owner)}${esc(owner.char || owner.name)}</span>` : ''}
        ${it.txt ? `<span class="txt">«${esc(it.txt)}»</span>` : ''}</${tag}>`;
    }).join('')}</div>`;
  },
  duel(st, meId) {
    const a = R.P(st, st.order[st.idx]), b = st.target ? R.P(st, st.target) : null;
    const nameOf = p => p.id === meId ? 'Ти' : esc(dn(p));
    return `<div class="duel">
      <div class="who">${av(a, 'lg')}${nameOf(a)}</div>
      <div class="arrow">${b ? '→' : '…'}</div>
      <div class="who">${b ? `${av(b, 'lg')}${nameOf(b)}` : '<span class="av lg" style="background:var(--panel2)">?</span><small>обирає</small>'}</div></div>`;
  },
  order(st) {
    return `<div class="order">${st.order.map((id, i) => `<span class="${i === st.idx ? 'cur' : i < st.idx ? 'past' : ''}">${esc(dn(R.P(st, id)))}</span>`).join('')}</div>`;
  },
  bars(st) {
    const r = st.res || { counts: {} };
    const max = Math.max(1, ...Object.values(r.counts));
    return `<div class="bars">${st.players.filter(p => p.alive || p.id === r.out).map(p => {
      const c = r.counts[p.id] || 0;
      return `<div class="bar ${p.id === r.out ? 'out' : ''}">${av(p)}<div class="track"><div class="fill" style="--w:${c / max * 100}%"></div></div><b>${c}</b></div>`;
    }).join('')}</div>`;
  },
  doneDots(st, ids) {
    const done = new Set(st.done || []);
    return `<div class="dots">${ids.map(id => { const p = R.P(st, id); return `<span title="${esc(dn(p))}">${av(p, done.has(id) ? 'on' : '')}</span>`; }).join('')}</div>`;
  },
  // налаштування ведучого в лобі (іншим — лише показ)
  settings(st) {
    const s = st.settings, ed = st.amHost;
    const chip = (k, label) => `<button class="opt-chip ${s[k] ? 'on' : ''}" ${ed ? `data-set="${k}"` : 'disabled'}>${label}</button>`;
    const pace = [[0.67, 'Швидко'], [1, 'Звичайно'], [1.5, 'Повільно']].map(([v, l]) => `<button class="opt-chip ${s.pace === v ? 'on' : ''}" ${ed ? `data-pace="${v}"` : 'disabled'}>${l}</button>`).join('');
    return `<div class="settings">
      <span class="label">Раунди${ed ? ' · тисни, щоб увімкнути чи вимкнути' : ''}</span>
      <div class="chips">${chip('drawing', '🎨 Малювання')}${chip('items', '🎁 Предмети')}${chip('emoji', '😀 Емодзі')}</div>
      <span class="label">Режим</span>
      <div class="chips"><button class="opt-chip on" ${ed ? 'data-remote="0"' : 'disabled'} ${s.remote ? 'style="text-decoration:line-through;opacity:.75;background:var(--panel);color:var(--muted);border-color:var(--line)"' : ''}>🛋️ Поруч — уголос</button>
        <button class="opt-chip ${s.remote ? 'on' : ''}" ${ed ? 'data-remote="1"' : 'disabled'}>🌐 На відстані — текстом</button></div>
      ${s.remote ? '<p class="muted" style="font-size:13px;margin:0">Питання, відповіді й пояснення до предметів пишуться в грі. Є чат 💬. Голос — за бажанням у Discord/Telegram.</p>' : ''}
      ${s.drawing && s.items ? '<p class="muted" style="font-size:13px;margin:0">Малювання й предмети чергуються між партіями.</p>' : ''}
      <span class="label">Темп (час на етапи)</span><div class="chips">${pace}</div></div>`;
  },
  bindSettings(root, st, send) {
    root.querySelectorAll('[data-set]').forEach(b => b.onclick = () => send('settings', { settings: { [b.dataset.set]: !st.settings[b.dataset.set] } }));
    root.querySelectorAll('[data-remote]').forEach(b => b.onclick = () => send('settings', { settings: { remote: b.dataset.remote === '1' } }));
    root.querySelectorAll('[data-pace]').forEach(b => b.onclick = () => send('settings', { settings: { pace: +b.dataset.pace } }));
    root.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => { if (confirm('Скинути рахунок усім?')) send('resetScore'); });
  },
  // імена по колу: хто вже назвався, хто зараз
  namelist(st) {
    const named = st.named || {};
    return `<div class="namelist">${st.order.map((id, i) => { const p = R.P(st, id), n = named[id];
      return `<div class="nrow ${i === st.idx ? 'cur' : ''} ${n ? 'done' : ''}">${av(p)}<span class="pn">${esc(p.name)}</span>
        <span class="cn">${n ? esc(n) : i === st.idx ? 'вигадує…' : '·  ·  ·'}</span></div>`; }).join('')}</div>`;
  },
  // питання й відповідь текстом (режим «на відстані»)
  qa(st, noWait = false) {
    const q = st.qa || {}, cur = st.order[st.idx];
    if (!q.q) return '';
    return `<div class="qa"><div class="bub q"><span class="who">${esc(dn(R.P(st, cur)))} питає</span>${esc(q.q)}</div>
      ${q.a ? `<div class="bub a"><span class="who">${esc(dn(R.P(st, st.target)))} відповідає</span>${esc(q.a)}</div>` : noWait ? '' : `<div class="bub a wait"><span class="who">${esc(dn(R.P(st, st.target)))}</span>пише відповідь…</div>`}</div>`;
  },
  // таблиця очок між партіями
  scores(st) {
    const ps = st.players.slice().sort((a, b) => b.score - a.score);
    if (!ps.some(p => p.score)) return '';
    const g = (st.end && st.end.gain) || {};
    return `<div class="scores"><span class="label">Рахунок</span>${ps.map((p, i) => `
      <div class="srow">${i === 0 && p.score > (ps[1] ? ps[1].score : 0) ? '<span class="rk">👑</span>' : `<span class="rk">${i + 1}</span>`}
        ${av({ name: p.name })}<span class="nm">${esc(p.name)}</span>${g[p.id] ? `<span class="gain">+${g[p.id]}</span>` : ''}<b>${p.score}</b></div>`).join('')}
      ${st.amHost ? '<button class="linkbtn" data-reset>Скинути рахунок</button>' : ''}</div>`;
  },
  // історія голосувань у кінці партії
  votes(st) {
    const e = st.end, log = (e && e.votes) || [];
    if (!log.length) return '';
    const who = id => esc(dn(R.P(st, id)));
    return `<div class="votelog"><span class="label">Хто за кого голосував</span>${log.map((r, i) => `
      <div class="paper" style="${rot(i)}"><div class="lbl">Голосування ${r.no}${r.revote ? ' · переголосування' : ''}</div>
        ${Object.entries(r.votes).map(([v, t]) => `<div class="vline"><span>${who(v)}</span><span class="arr">→</span><b class="${e.spyIds.includes(t) ? 'hit' : ''}">${who(t)}</b></div>`).join('')}
        <div class="vout">${r.out ? `Вибув: <b>${who(r.out)}</b>${e.spyIds.includes(r.out) ? ' — шпигун 🕵️' : ''}` : 'Нікого не вигнали'}</div></div>`).join('')}</div>`;
  },
  endReveal(st) {
    const e = st.end, spies = e.spyIds.map(id => R.P(st, id));
    return `<div class="reveal3">
      <div class="paper" style="${rot(0)}"><div class="lbl">Тема</div><div class="val">${esc(st.theme)}</div>
        <div class="lbl">Локація</div><div class="val">${esc(e.location)}</div></div>
      <div class="paper" style="${rot(1)}"><div class="lbl">${spies.length > 1 ? 'Шпигуни' : 'Шпигун'}</div>
        ${spies.map(spy => `<div class="val" style="display:flex;align-items:center;gap:10px;margin-bottom:4px">${av(spy, 'lg')}<span>${esc(spy.name)}${spy.char ? `<br><span style="font:600 14px var(--body);opacity:.7">«${esc(spy.char)}»</span>` : ''}</span></div>`).join('')}
        ${e.guess ? `<div class="lbl" style="margin-top:12px">Здогадка${e.guessBy ? ' · ' + esc(dn(R.P(st, e.guessBy))) : ''}</div><div class="val" style="font-size:20px">«${esc(e.guess)}»</div>` : ''}
        ${e.tally ? `<div class="lbl">Рішення мирних</div><div class="val" style="font-size:20px">✓ ${e.tally.yes} · ✗ ${e.tally.no}</div>` : ''}</div></div>`;
  },
};

function confetti() {
  const box = document.createElement('div'); box.className = 'confetti';
  const colors = ['#e3412a', '#f0bd4f', '#4fd18b', '#5b8cff', '#efe3c4'];
  box.innerHTML = Array.from({ length: 90 }, () =>
    `<i style="left:${Math.random() * 100}%;background:${colors[Math.floor(Math.random() * colors.length)]};animation-duration:${2.2 + Math.random() * 2.4}s;animation-delay:${Math.random() * .8}s;transform:rotate(${Math.random() * 360}deg)"></i>`).join('');
  document.body.appendChild(box); setTimeout(() => box.remove(), 6000);
}
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2200); }
// ---------- звуки (Web Audio, без файлів) ----------
const Sound = (() => {
  let ctx = null, on = store.get('spy_sound') !== false, unlocked = false;
  // iPhone: без цього Web Audio мовчить, коли увімкнено беззвучний режим
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  function unlock() {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state !== 'running') ctx.resume();
      if (!unlocked) {   // тихий звук прямо в жесті — так браузер «відкриває» аудіо
        const b = ctx.createBuffer(1, 1, 22050), src = ctx.createBufferSource();
        src.buffer = b; src.connect(ctx.destination); src.start(0);
        unlocked = true;
      }
    } catch (e) {}
  }
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) addEventListener(ev, unlock, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); });
  function play(notes) {
    if (!on) return;
    if (!ctx) { unlock(); if (!ctx) return; }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    const t = ctx.currentTime + .02;
    for (const [f, at, dur, type = 'sine', vol = .35] of notes) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(vol, t + at + .015); g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(g); g.connect(ctx.destination); o.start(t + at); o.stop(t + at + dur + .05);
    }
    Sound.played = (Sound.played || 0) + 1;
  }
  const Sound = {
    get on() { return on; },
    toggle() { on = !on; store.set('spy_sound', on); unlock(); if (on) this.turn(); return on; },
    turn() { play([[660, 0, .14, 'triangle'], [990, .15, .26, 'triangle']]); },                  // твоя черга
    timeUp() { play([[520, 0, .22, 'square', .2], [350, .24, .42, 'square', .2]]); },           // час вийшов
    tick() { play([[1200, 0, .06, 'sine', .2]]); },                                              // останні секунди
    reveal() { play([[523, 0, .13, 'triangle'], [659, .11, .13, 'triangle'], [784, .22, .3, 'triangle']]); },
    chat() { play([[880, 0, .08, 'sine', .2]]); },
  };
  return Sound;
})();

function buzz(ms = 60) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }
