// ===== Шпигун — спільне для телефона і великого екрана =====
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

// ---------- газетні дрібниці ----------
// літери, вирізані з різних газет (як у листі з викупом)
const RL = ['ink', 'clip', 'kraft', 'red', 'tan', 'lined'];
function ransom(text, size = 34, cls = '') {
  let k = 0;
  return `<span class="ransom ${cls}" aria-label="${esc(text)}" style="--fs:${size}px">${[...String(text)].map((ch, i) => {
    if (ch === ' ') return '<span class="rl-gap"></span>';
    const v = RL[(i * 7 + text.length * 3) % RL.length], r = [-5, 3, -2, 6, -3, 2, -6, 4, -1, 5][(i * 3 + k++) % 10];
    return `<span class="rl ${v}" aria-hidden="true" style="--r:${r}deg;--i:${i}">${esc(ch)}</span>`;
  }).join('')}</span>`;
}
// клаптики старих газет по краях сторінки
function scraps() {
  if (document.querySelector('.scraps')) return;
  const d = document.createElement('div'); d.className = 'scraps'; d.setAttribute('aria-hidden', 'true');
  d.innerHTML = `<i class="sc grid" style="top:16vh;left:-62px;--r:-8deg"></i>
    <i class="sc cols" style="top:42vh;right:-60px;--r:10deg"></i>
    <i class="sc kraft" style="top:74vh;left:-44px;--r:-9deg"><b>СЕНСАЦ</b><small>БІРЖОВІ ВІДОМОСТІ · КУРС ПІДОЗР</small></i>
    <i class="sc dots" style="top:88vh;right:-24px;--r:7deg"></i><i class="fold"></i>`;
  document.body.prepend(d);
}
document.addEventListener('DOMContentLoaded', scraps);
const ICON = {
  chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
  role: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M7 10h6M7 14h10"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h11a3 3 0 0 1 3 3v11H7a3 3 0 0 1-3-3z"/><path d="M8 9h6M8 13h6"/></svg>',
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
  mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 10l4 4M21 10l-4 4"/></svg>',
  door: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4H6v16h8"/><path d="M11 12h10M18 9l3 3-3 3"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2-6z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  fill: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11l7-7 7 7-7 7z"/><path d="M20 15c0 2-1 3-1.5 3S17 17 17 15c0-1 1.5-3 1.5-3S20 14 20 15z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  rl: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v6h6"/><path d="M4.5 10A8 8 0 1 1 6 17"/></svg>',
  rr: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4v6h-6"/><path d="M19.5 10A8 8 0 1 0 18 17"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>',
  hand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.6-1.5L8 13"/></svg>',
  pen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/></svg>',
};

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
  function html() { return `<div class="ring" id="ring" role="timer" hidden><svg viewBox="0 0 46 46"><circle class="bg" cx="23" cy="23" r="20"/><circle class="fg" cx="23" cy="23" r="20" stroke-dasharray="125.66" stroke-dashoffset="0"/></svg><span></span><small>час</small></div>`; }
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
    el.querySelector('span').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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
  scene: 'Сцена', sceneReveal: 'Сцени', clock: 'Годинник', clockReveal: 'Годинник', notes: 'Записки', notesReveal: 'Записки',
};
const rot = i => `--rot:${[-2.2, 1.6, -1, 2.4, -1.8, 1.1, -2.6, 1.9][i % 8]}deg`;

// ---------- спільні блоки ----------
const R = {
  P(st, id) { return st.players.find(p => p.id === id) || { name: '?', char: '' }; },
  alive(st) { return st.players.filter(p => p.alive); },
  // у додаткових раундах після голосування показуємо, що сталося (хто вибув)
  phaseTag(st, text) { return `<div class="phase-tag"><span>${esc(text || PHASE_NAME[st.phase] || '')}</span></div>${st.notice && ['drawing', 'items', 'scene', 'emoji', 'clock', 'notes'].includes(st.phase) ? `<div class="banner">${esc(st.notice)}</div>` : ''}`; },

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
  gallery(st, field = 'drawings') {
    return `<div class="gallery">${R.alive(st).map((p, i) => {
      const img = st[field] && st[field][p.id];
      return `<div class="polaroid" style="${rot(i)};animation-delay:${i * .15}s" ${img ? `data-zoom="${i}"` : ''}>
        ${img ? `<img src="${img}" alt="Малюнок: ${esc(p.char || p.name)}">` : '<div class="none">не здано</div>'}
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
      <div class="who">${b ? `${av(b, 'lg')}${nameOf(b)}` : '<span class="av lg q">?</span><small>обирає</small>'}</div></div>`;
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
      <div class="sec-head"><span>Рубрики номера</span>${ed ? '<small>тисни, щоб увімкнути</small>' : ''}</div>
      <div class="chips">${chip('drawing', 'Малювання')}${chip('items', 'Предмети')}${chip('scene', 'Сцена')}${chip('emoji', 'Емодзі')}${chip('clock', 'Годинник')}${chip('notes', 'Записки')}</div>
      <p class="fine">Щогри випадково 2 різні з увімкнених: одна після імен, друга перед голосуванням.</p>
      <div class="sec-head"><span>Як граємо</span></div>
      <div class="chips"><button class="opt-chip ${s.remote ? '' : 'on'}" ${ed ? 'data-remote="0"' : 'disabled'}>Поруч — уголос</button>
        <button class="opt-chip ${s.remote ? 'on' : ''}" ${ed ? 'data-remote="1"' : 'disabled'}>На відстані — текстом</button></div>
      ${s.remote ? '<p class="fine">Питання, відповіді й пояснення до предметів пишуться в грі, а для розмов є чат. Голос — за бажанням у Discord чи Telegram.</p>' : ''}
      <div class="sec-head"><span>Темп</span><small>час на етапи</small></div><div class="chips">${pace}</div></div>`;
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
  // годинник: 24-годинний циферблат з мітками гравців / шкала тривалості
  SPANS: ['5 хв', '15 хв', '30 хв', '1 год', '2 год', '4 год', 'пів дня', 'цілий день'],
  hhmm: h => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`,
  dial(marks, size = 240, hand = null) {
    const c = size / 2, R0 = c - 26;
    const ang = h => ((h - 12) / 24) * 2 * Math.PI - Math.PI / 2;   // полудень угорі, північ унизу
    let svg = `<svg class="dial" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${c}" cy="${c}" r="${c - 4}" class="face"/>`;
    for (let h = 0; h < 24; h++) {
      const a = ang(h), big = h % 6 === 0, r1 = c - 6, r2 = c - (big ? 16 : 11);
      svg += `<line x1="${c + r1 * Math.cos(a)}" y1="${c + r1 * Math.sin(a)}" x2="${c + r2 * Math.cos(a)}" y2="${c + r2 * Math.sin(a)}" class="${big ? 'tk big' : 'tk'}"/>`;
      if (big) svg += `<text x="${c + (c - 30) * Math.cos(a)}" y="${c + (c - 30) * Math.sin(a)}" class="hl">${h}</text>`;
    }
    svg += `<text x="${c}" y="${c - 46}" class="hl sm">☀️</text><text x="${c}" y="${c + 50}" class="hl sm">🌙</text>`;
    if (hand != null) { const a = ang(hand); svg += `<line x1="${c}" y1="${c}" x2="${c + R0 * .8 * Math.cos(a)}" y2="${c + R0 * .8 * Math.sin(a)}" class="hand"/><circle cx="${c}" cy="${c}" r="6" class="pin"/>`; }
    // мітки гравців: однакові години — на різних радіусах
    const at = {};
    for (const m of marks) {
      const k = m.h, n = at[k] = (at[k] || 0) + 1, a = ang(m.h), r = R0 - 30 - (n - 1) * 24;
      svg += `<line x1="${c}" y1="${c}" x2="${c + r * Math.cos(a)}" y2="${c + r * Math.sin(a)}" class="ray" style="--h:${m.hue}"/>
        <circle cx="${c + r * Math.cos(a)}" cy="${c + r * Math.sin(a)}" r="11" class="mk" style="--h:${m.hue}"/>
        <text x="${c + r * Math.cos(a)}" y="${c + r * Math.sin(a)}" class="mkt">${esc(m.l)}</text>`;
    }
    return svg + '</svg>';
  },
  clockReveal(st) {
    const ans = st.clockAns || {}, ps = R.alive(st).filter(p => ans[p.id]);
    const letter = p => ([...dn(p).trim()][0] || '?').toUpperCase();
    return `<div class="clocks">${st.cq.map((c, i) => {
      const rows = ps.map(p => `<div class="crow">${av(p)}<span>${esc(dn(p))}</span><b>${c.t === 'h' ? R.hhmm(ans[p.id][i]) : R.SPANS[ans[p.id][i]]}</b></div>`).join('') || '<p class="muted">Ніхто не відповів</p>';
      const pic = c.t === 'h'
        ? R.dial(ps.map(p => ({ h: ans[p.id][i], hue: hueOf(p.name), l: letter(p) })))
        : `<div class="span-scale">${R.SPANS.map((l, k) => `<div class="sp"><div class="dots2">${ps.filter(p => ans[p.id][i] === k).map(p => av(p)).join('')}</div><span>${l}</span></div>`).join('')}</div>`;
      return `<div class="paper clockcard" style="${rot(i)}"><div class="lbl">${esc(c.q)}</div>${pic}<div class="crows">${rows}</div></div>`;
    }).join('')}</div>`;
  },
  // анонімні записки
  notes(st) {
    return `<div class="notes">${(st.notes || []).map((n, i) => `<div class="paper note" style="${rot(i)};animation-delay:${i * .12}s">
      <div class="nq">${esc(n.q)}</div><div class="na">${esc(n.a)}</div></div>`).join('') || '<p class="muted center">Записок нема</p>'}</div>`;
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
    return `<div class="scores"><div class="sec-head"><span>Таблиця рахунку</span>${st.amHost ? '<button class="linkbtn" data-reset>скинути</button>' : ''}</div>${ps.map((p, i) => `
      <div class="srow" style="--i:${i}">${i === 0 && p.score > (ps[1] ? ps[1].score : 0) ? '<span class="rk">♛</span>' : `<span class="rk">${i + 1}</span>`}
        <span class="nm">${esc(p.name)}</span><span class="lead"></span>${g[p.id] ? `<span class="gain">+${g[p.id]}</span>` : ''}<b>${p.score}</b></div>`).join('')}</div>`;
  },
  // історія голосувань у кінці партії
  votes(st) {
    const e = st.end, log = (e && e.votes) || [];
    if (!log.length) return '';
    const who = id => esc(dn(R.P(st, id)));
    return `<div class="votelog">${log.map((r, i) => `
      <div class="chron"><div class="sec-head"><span>Хроніка голосування № ${r.no}${r.revote ? ' · переголосування' : ''}</span></div>
        <div class="vgrid">${Object.entries(r.votes).map(([v, t]) => `<div class="vline"><span>${who(v)}</span><span class="arr">→</span><b class="${e.spyIds.includes(t) ? 'hit' : ''}">${who(t)}</b></div>`).join('')}</div>
        <div class="vout">${r.out ? `Вибув: <b>${who(r.out)}</b>${e.spyIds.includes(r.out) ? ' — <span class="hit">шпигун</span>' : ' — мирний'}` : 'Нікого не вигнали'}</div></div>`).join('')}</div>`;
  },
  // плакат «Розшукується» (голосування)
  poster(st, p, { tag = 'div', sel = false, attr = '', stamp = '', i = 0 } = {}) {
    const letter = ([...dn(p).trim()][0] || '?').toUpperCase();
    return `<${tag} class="wanted ${sel ? 'sel' : ''}" ${attr} style="${rot(i)};--i:${i}">
      <span class="w-top">Розшукується</span>
      <span class="w-photo"><span>${esc(letter)}</span></span>
      <span class="w-name">${esc(dn(p))}</span>
      ${p.char && p.char !== p.name ? `<span class="w-real">він же ${esc(p.name)}</span>` : '<span class="w-real">&nbsp;</span>'}
      ${stamp ? `<span class="stamp w-stamp">${stamp}</span>` : ''}</${tag}>`;
  },
  // фінал: перша шпальта газети
  front(st, meId) {
    const e = st.end, spyWon = e.winner === 'spy', spies = e.spyIds.map(id => R.P(st, id)), multi = spies.length > 1;
    const me = meId && st.me, iWon = me ? (me.isSpy ? spyWon : !spyWon) : null;
    const [w1, w2] = spyWon ? (multi ? ['Шпигуни', 'втекли!'] : ['Шпигун', 'утік!']) : (multi ? ['Шпигунів', 'викрито!'] : ['Шпигуна', 'викрито!']);
    const by = e.guessBy ? esc(dn(R.P(st, e.guessBy))) : '';
    const story = `едакція повідомляє: тема вечора — «${esc(st.theme)}», місце події — <b>${esc(e.location)}</b>. ` +
      (e.guess ? `${by ? `Агент «${by}»` : 'Шпигун'} назвав локацію «${esc(e.guess)}»${e.tally ? ` — рішення мирних: ✓ ${e.tally.yes} · ✗ ${e.tally.no}` : ''}. ` : 'Локацію шпигун так і не назвав. ') +
      (spyWon ? 'Редакція шукає винних.' : 'Мирні громадяни можуть спати спокійно.');
    return `<article class="front">
      <div class="front-mast"><span class="fm-strip"><span>Спецвипуск</span><span>Вихід ${esc(st.code)}</span></span>
        <span class="fm-title">Вечірній Шпигун</span><span class="fm-rule">❦ Справу закрито ❦</span></div>
      <div class="flashrow"><span class="flash ${iWon === false ? 'lose' : ''}">${iWon == null ? 'Блискавка!' : iWon ? 'Ти переміг!' : 'Цього разу — поразка'}</span><span class="hatch"></span></div>
      <h1 class="front-h"><span>${w1}</span>${ransom(w2, 36)}<span class="acc">у локації «${esc(e.location)}»</span></h1>
      <p class="deck">${esc(REASON[e.reason] || '')}</p>
      <div class="front-body">
        <div class="figs">${spies.map(s => `<figure class="fig"><div class="photo"><span>${esc(([...dn(s).trim()][0] || '?').toUpperCase())}</span></div>
          <span class="stamp">${spyWon ? 'На волі' : 'Викрито'}</span>
          <figcaption>Фото: ${s.char ? `«${esc(s.char)}», він же ` : ''}${esc(s.name)}</figcaption></figure>`).join('')}</div>
        <p class="story"><span class="drop">Р</span>${story}</p>
      </div></article>`;
  },
};

function confetti() {
  const box = document.createElement('div'); box.className = 'confetti';
  const colors = ['#2a2117', '#eadbb0', '#c49a5e', '#8f2f1f', '#e8d5a4', '#b8935e'];
  box.innerHTML = Array.from({ length: 90 }, () =>
    `<i style="left:${Math.random() * 100}%;width:${8 + Math.random() * 14}px;height:${10 + Math.random() * 18}px;background:${colors[Math.floor(Math.random() * colors.length)]};--sx:${(Math.random() - .5) * 160}px;animation-duration:${2.6 + Math.random() * 2.6}s;animation-delay:${Math.random() * .9}s"></i>`).join('');
  document.body.appendChild(box); setTimeout(() => box.remove(), 6000);
}
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2200); }
// ---------- звуки (Web Audio, без файлів): друкарська машинка, папір, печатка, друкарня ----------
const Sound = (() => {
  let ctx = null, on = store.get('spy_sound') !== false, unlocked = false, nbuf = null, lastKey = 0;
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
  function ready() {
    if (!on) return false;
    if (!ctx) { unlock(); if (!ctx) return false; }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    return true;
  }
  // тони: [частота, коли, тривалість, форма, гучність]
  function play(notes) {
    if (!ready()) return;
    const t = ctx.currentTime + .02;
    for (const [f, at, dur, type = 'sine', vol = .35, f2] of notes) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t + at); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + at + dur);
      g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(vol, t + at + .01); g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(g); g.connect(ctx.destination); o.start(t + at); o.stop(t + at + dur + .05);
    }
    Sound.played = (Sound.played || 0) + 1;
  }
  // шум: [коли, тривалість, гучність, частота фільтра, тип фільтра, добротність]
  function noise(parts) {
    if (!ready()) return;
    if (!nbuf) { nbuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const t = ctx.currentTime + .02;
    for (const [at, dur, vol, f, type = 'bandpass', q = 1] of parts) {
      const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = nbuf; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(vol, t + at + Math.min(.012, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      s.connect(fl); fl.connect(g); g.connect(ctx.destination); s.start(t + at, Math.random() * .5); s.stop(t + at + dur + .05);
    }
    Sound.played = (Sound.played || 0) + 1;
  }
  const Sound = {
    get on() { return on; },
    toggle() { on = !on; store.set('spy_sound', on); unlock(); if (on) this.turn(); return on; },
    // твоя черга: дзвіночок друкарської машинки
    turn() { noise([[0, .09, .25, 1800, 'bandpass', .8]]); play([[2093, .06, .9, 'sine', .22], [4186, .06, .4, 'sine', .07]]); },
    // час вийшов: два удари будильника
    timeUp() { play([[880, 0, .12, 'square', .12], [660, .14, .12, 'square', .12], [880, .32, .12, 'square', .12], [660, .46, .3, 'square', .12]]); },
    tick() { noise([[0, .03, .3, 3200, 'highpass']]); play([[1500, 0, .03, 'square', .05]]); },        // останні секунди
    reveal() { this.paper(); play([[784, .12, .5, 'sine', .14], [1175, .2, .7, 'sine', .1]]); },      // розкриття
    chat() { noise([[0, .05, .2, 2400, 'bandpass', 2]]); play([[1320, 0, .09, 'sine', .12]]); },
    // шелест сторінки
    paper() { noise([[0, .16, .16, 4200, 'bandpass', .6], [.07, .22, .12, 2600, 'bandpass', .5], [.2, .12, .08, 5200, 'bandpass', .7]]); },
    // удар печатки
    stamp() { noise([[0, .14, .55, 320, 'lowpass', .7], [0, .05, .3, 1600, 'bandpass', 1]]); play([[120, 0, .16, 'sine', .45, 55]]); },
    // клавіша друкарської машинки
    key() { const n = performance.now(); if (n - lastKey < 35) return; lastKey = n; noise([[0, .035, .22, 2800 + Math.random() * 900, 'bandpass', 1.4]]); play([[180, 0, .04, 'square', .05]]); },
    // друкарський верстат: ритмічні удари + шелест
    press() { const p = []; for (let i = 0; i < 5; i++) p.push([i * .16, .1, .4, 260, 'lowpass', .8], [i * .16 + .05, .07, .12, 3000, 'bandpass', .8]); noise(p); this.paper(); setTimeout(() => this.stamp(), 900); },
  };
  // друк у полях — клацання машинки
  addEventListener('input', e => { if (e.target.matches && e.target.matches('input[type=text], textarea') && e.inputType !== 'deleteContentBackward') Sound.key(); }, true);
  return Sound;
})();

function buzz(ms = 60) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }
