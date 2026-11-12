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
  items: 'Предмети', itemsDone: 'Предмети', emoji: 'Емодзі', emojiReveal: 'Емодзі', review: 'Відгук', reviewReveal: 'Відгуки', horoscope: 'Гороскоп', horoscopeReveal: 'Гороскоп', ads: 'Оголошення', adsReveal: 'Оголошення', headline: 'Заголовок дня', headlineReveal: 'Заголовок дня', auction: 'Аукціон', auctionReveal: 'Підсумки торгів', vote: 'Голосування', voteResult: 'Вирок', guess: 'Шанс шпигуна', verdict: 'Здогадка',
  words: 'Одне слово', wordsReveal: 'Слова', end: 'Справу закрито',
  scene: 'Сцена', sceneReveal: 'Сцени',
};
const rot = i => `--rot:${[-2.2, 1.6, -1, 2.4, -1.8, 1.1, -2.6, 1.9][i % 8]}deg`;

// ---------- спільні блоки ----------
const R = {
  P(st, id) { return st.players.find(p => p.id === id) || { name: '?', char: '' }; },
  alive(st) { return st.players.filter(p => p.alive); },
  // у додаткових раундах після голосування показуємо, що сталося (хто вибув)
  phaseTag(st, text) { return `<div class="phase-tag"><span>${esc(text || PHASE_NAME[st.phase] || '')}</span></div>${st.notice && ['drawing', 'items', 'scene', 'emoji', 'review', 'auction', 'horoscope', 'ads', 'headline'].includes(st.phase) ? `<div class="banner">${esc(st.notice)}</div>` : ''}`; },

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
  // кнопки керування ведучого в допиті/поясненні предметів: пауза, +хвилина, повтор ходу, назад
  hostCtl(st) {
    const q = st.phase === 'questions';
    return `<div class="hostctl">${st.paused ? '<button class="btn small" data-host="resume">▶ Продовжити</button>' : '<button class="btn small" data-host="pause">⏸ Пауза</button>'}<button class="btn small" data-host="plus">+1 хв</button>${q ? '<button class="btn small" data-host="qrepeat">↺ Спочатку</button><button class="btn small" data-host="qback">← Назад</button>' : ''}</div>`;
  },
  pauseBanner(st) {
    if (!st.paused) return '';
    const l = st.pausedLeft || 0;
    return `<div class="paper pausebar"><b>⏸ Пауза</b> · залишилось ${Math.floor(l / 60)}:${String(l % 60).padStart(2, '0')}</div>`;
  },
  // записки раундів «відгук / гороскоп / оголошення / заголовок»: картки + голосування за найкращий (не свій)
  fav(st, kind, interactive = false) {
    const src = (kind === 'review' ? st.reviews : st.texts) || {}, m = st.me || {};
    const won = st.stage === 'won', win = st.favWin || [], cnt = st.favCount || {};
    const ps = R.alive(st).filter(p => src[p.id]);
    const body = (p, i) => {
      const e = src[p.id], by = `<div class="by">${kind === 'headline' ? 'Від нашого кореспондента: ' : '— '}${esc(dn(p))}</div>`;
      if (kind === 'review') return `<div class="who">${av(p)}<b>${esc(dn(p))}</b></div><div class="stars">${'★'.repeat(e.s)}<i>${'★'.repeat(5 - e.s)}</i></div><p>«${esc(e.t)}»</p>`;
      if (kind === 'horoscope') return `<div class="hs">✦ Гороскоп ✦</div><p>${esc(e)}</p>${by}`;
      if (kind === 'ads') return `<div class="ad-head">★ Оголошення ★</div><p>${esc(e)}</p>${by}`;
      return `<h3 class="hl">${esc(e)}</h3>${by}`;
    };
    const left = R.alive(st).length - (st.done || []).length;
    const status = won ? (win.length ? '<p class="muted center">Редакція обрала — на першу шпальту!</p>' : '<p class="muted center">Голосів не було.</p>')
      : `<p class="muted center">${interactive && m.alive ? (m.favPick ? 'Голос враховано — можна змінити.' : 'Тапни найкращий запис (не свій).') : 'Читаємо й голосуємо за найкращий.'} Проголосували: ${(st.done || []).length} з ${R.alive(st).length}</p>`;
    return `${status}<div class="fav kind-${kind}">${ps.map((p, i) => `
      <div class="paper fv ${win.includes(p.id) ? 'win' : ''} ${m.favPick === p.id ? 'picked' : ''} ${interactive && !won && m.alive && p.id !== m.id ? 'tap' : ''}" style="${rot(i)};animation-delay:${i * .12}s" ${interactive && !won && m.alive && p.id !== m.id ? `data-fav="${p.id}"` : ''}>
        ${body(p, i)}${won ? `<span class="fcount">${cnt[p.id] || 0} ♥</span>` : ''}${win.includes(p.id) ? '<span class="stamp fstamp">На першу шпальту</span>' : ''}</div>`).join('')}</div>`;
  },
  // таблиця ставок аукціону: гравці × лоти, внизу сума
  auction(st) {
    const lots = st.lots || [], bids = st.bids || {}, ps = R.alive(st);
    const tot = lots.map((_, k) => ps.reduce((a, p) => a + ((bids[p.id] || [])[k] || 0), 0));
    const mx = Math.max(1, ...tot);
    return `<div class="auc" style="--cols:${lots.length}">
      <div class="ar head"><div class="an"></div>${lots.map(l => `<div class="al"><span class="e">${l.e}</span><small>${esc(l.n)}</small></div>`).join('')}</div>
      ${ps.map((p, i) => `<div class="ar" style="animation-delay:${i * .1}s"><div class="an">${av(p)}<span>${esc(dn(p))}</span></div>${lots.map((_, k) => { const v = (bids[p.id] || [])[k]; return v == null ? '<div class="ac none">—</div>' : `<div class="ac" style="--h:${Math.min(1, v / 50)}">${v}</div>`; }).join('')}</div>`).join('')}
      <div class="ar sum"><div class="an"><span>Разом</span></div>${tot.map(t => `<div class="ac" style="--h:${t / mx}">${t}</div>`).join('')}</div></div>`;
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
    const outs = r.outs || [];
    return `<div class="bars">${st.players.filter(p => p.alive || outs.includes(p.id)).map(p => {
      const c = r.counts[p.id] || 0;
      return `<div class="bar ${outs.includes(p.id) ? 'out' : ''}">${av(p)}<div class="track"><div class="fill" style="--w:${c / max * 100}%"></div></div><b>${c}</b></div>`;
    }).join('')}</div>`;
  },
  // голосування, що вигонить двох (перше при трьох шпигунах)
  needNote(st) { return st.need > 1 ? `<div class="banner">Перше голосування вигонить <b>двох</b>: вибувають двоє з найбільшою кількістю голосів.</div>` : ''; },
  // результат голосування: один або кілька вигнаних
  outs(st, small) {
    const r = st.res || {}, outs = (r.outs || []).map(id => R.P(st, id)).filter(Boolean), m = st.me;
    if (!outs.length) return `<h1 class="headline">${ransom('Нікого', small ? 32 : 56)}<span>не вигнали</span></h1>`;
    const names = outs.map(o => esc(dn(o))).join(' і ');
    const title = m && outs.some(o => o.id === m.id) ? (outs.length > 1 ? `Тебе вигнали разом із ${outs.filter(o => o.id !== m.id).map(o => esc(dn(o))).join('')}` : 'Тебе вигнали') : `Вигнали: ${names}`;
    return `<div class="outs">${outs.map(o => R.poster(st, o, { stamp: 'Вигнано' })).join('')}</div><h1 class="headline">${title}</h1>`;
  },
  doneDots(st, ids) {
    const done = new Set(st.done || []);
    return `<div class="dots">${ids.map(id => { const p = R.P(st, id); return `<span title="${esc(dn(p))}">${av(p, done.has(id) ? 'on' : '')}</span>`; }).join('')}</div>`;
  },
  // налаштування ведучого в лобі (іншим — лише показ)
  settings(st) {
    const s = st.settings, ed = st.amHost;
    const chip = (k, label) => `<button class="opt-chip ${s[k] !== false ? 'on' : ''}" ${ed ? `data-set="${k}"` : 'disabled'}>${label}</button>`;
    const pace = [[0.67, 'Швидко'], [1, 'Звичайно'], [1.5, 'Повільно']].map(([v, l]) => `<button class="opt-chip ${s.pace === v ? 'on' : ''}" ${ed ? `data-pace="${v}"` : 'disabled'}>${l}</button>`).join('');
    return `<div class="settings">
      <div class="sec-head"><span>Рубрики номера</span>${ed ? '<small>тисни, щоб увімкнути</small>' : ''}</div>
      <div class="chips">${chip('drawing', 'Малювання')}${chip('items', 'Предмети')}${chip('scene', 'Сцена')}${chip('emoji', 'Емодзі')}${chip('review', 'Відгук')}${chip('auction', 'Аукціон')}${chip('horoscope', 'Гороскоп')}${chip('ads', 'Оголошення')}${chip('headline', 'Заголовок')}</div>
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
  // архів номерів: історія партій кімнати
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
        <div class="vout">${(r.outs || []).length ? (r.outs.length > 1 ? 'Вибули: ' : 'Вибув: ') + r.outs.map(o => `<b>${who(o)}</b>${e.spyIds.includes(o) ? ' — <span class="hit">шпигун</span>' : ' — мирний'}`).join('; ') : 'Нікого не вигнали'}</div></div>`).join('')}</div>`;
  },
  history(st, meName) {
    const h = st.history || [];
    if (!h.length) return `<details class="archive"><summary><span>Архів номерів · 0</span><small>порожньо</small></summary><p class="muted center" style="padding:10px">Тут з'являться завершені партії цієї кімнати: локація, хто був шпигуном і чим усе скінчилося.</p></details>`;
    const WIN = { spy: 'шпигун утік', civ: 'шпигуна викрито' };
    return `<details class="archive"><summary><span>Архів номерів · ${h.length}</span><small>хто був шпигуном</small></summary>
      <div class="arch-list">${h.map((g, i) => `<div class="arch-row ${g.winner === 'spy' ? 'spy' : ''}" style="--i:${i}">
        <span class="arch-n">№ ${g.n}</span>
        <span class="arch-main"><b>${esc(g.loc)}</b><small>${esc(g.theme)} · ${g.players} гравців</small></span>
        <span class="arch-who"><small>${g.spies.length > 1 ? 'шпигуни' : 'шпигун'}</small><b>${g.spies.map(esc).join(', ')}</b></span>
        <span class="arch-res ${g.winner === 'spy' ? 'hit' : ''}">${g.winner === 'spy' ? (g.spies.length > 1 ? 'шпигуни втекли' : 'шпигун утік') : 'викрито'}${g.guess ? `<small>«${esc(g.guess)}»</small>` : ''}</span>
      </div>`).join('')}</div></details>`;
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
// Усе зведено в діапазон 300–5000 Гц — нижче динамік телефона просто не відтворює.
const Sound = (() => {
  let ctx = null, master = null, on = store.get('spy_sound') !== false, nbuf = null, lastKey = 0;
  // iPhone: без цього Web Audio мовчить, коли увімкнено беззвучний режим
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  function make() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      // компресор + загальна гучність: на телефоні тихі звуки інакше губляться
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = .003; comp.release.value = .15;
      master = ctx.createGain(); master.gain.value = 1.6; master.connect(comp); comp.connect(ctx.destination);
    } catch (e) { ctx = null; }
  }
  // Android/iOS дозволяють звук лише після жесту — ловимо перший дотик і «відкриваємо» контекст у ньому
  function unlock() {
    make(); if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    try { const b = ctx.createBuffer(1, 1, 22050), src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start(0); } catch (e) {}
  }
  for (const ev of ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown']) addEventListener(ev, unlock, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); });
  function ready() {
    if (!on) return false;
    make(); if (!ctx) return false;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    return true;
  }
  // тони: [частота, коли, тривалість, форма, гучність, частота в кінці]
  function play(notes) {
    if (!ready()) return;
    const t = ctx.currentTime + .02;
    for (const [f, at, dur, type = 'sine', vol = .5, f2] of notes) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t + at); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + at + dur);
      g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(vol, t + at + .008); g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(g); g.connect(master); o.start(t + at); o.stop(t + at + dur + .05);
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
      g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(vol, t + at + Math.min(.01, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      s.connect(fl); fl.connect(g); g.connect(master); s.start(t + at, Math.random() * .5); s.stop(t + at + dur + .05);
    }
    Sound.played = (Sound.played || 0) + 1;
  }
  const Sound = {
    get on() { return on; },
    // чи реально звучить (для підказки користувачу)
    get running() { return !!ctx && ctx.state === 'running'; },
    toggle() { on = !on; store.set('spy_sound', on); unlock(); if (on) this.test(); return on; },
    test() { this.turn(); setTimeout(() => this.stamp(), 450); },
    // твоя черга: дзвіночок друкарської машинки
    turn() { noise([[0, .08, .5, 2200, 'bandpass', 1]]); play([[2093, .04, .9, 'sine', .6], [4186, .04, .5, 'sine', .18], [2637, .3, .5, 'sine', .25]]); },
    // час вийшов: дзвінок будильника
    timeUp() { const n = []; for (let i = 0; i < 8; i++) n.push([i % 2 ? 1760 : 1480, i * .07, .06, 'square', .18]); n.push([1480, .6, .35, 'square', .18]); play(n); },
    tick() { noise([[0, .025, .6, 3600, 'bandpass', 2]]); play([[1800, 0, .035, 'square', .14]]); },        // останні секунди
    reveal() { this.paper(); play([[784, .12, .4, 'triangle', .35], [1175, .22, .6, 'triangle', .3], [1568, .34, .7, 'sine', .25]]); },      // розкриття
    chat() { noise([[0, .04, .4, 2600, 'bandpass', 2]]); play([[1320, 0, .08, 'sine', .3], [1760, .08, .12, 'sine', .25]]); },
    // шелест сторінки
    paper() { noise([[0, .14, .55, 3800, 'bandpass', .5], [.06, .2, .45, 2400, 'bandpass', .4], [.18, .14, .35, 5000, 'bandpass', .6]]); },
    // удар печатки: глухий «бух» + клац
    stamp() { noise([[0, .12, .9, 420, 'lowpass', .8], [0, .04, .6, 1800, 'bandpass', 1]]); play([[520, 0, .14, 'triangle', .7, 160]]); },
    // клавіша друкарської машинки
    key() { const n = performance.now(); if (n - lastKey < 35) return; lastKey = n; noise([[0, .03, .55, 3000 + Math.random() * 900, 'bandpass', 1.4]]); play([[900, 0, .03, 'square', .12]]); },
    // друкарський верстат: ритмічні удари + шелест, наприкінці печатка
    press() { const p = []; for (let i = 0; i < 5; i++) p.push([i * .16, .09, .8, 480, 'lowpass', .8], [i * .16 + .05, .06, .4, 3200, 'bandpass', .8]); noise(p); this.paper(); setTimeout(() => this.stamp(), 900); },
  };
  // друк у полях — клацання машинки
  addEventListener('input', e => { if (e.target.matches && e.target.matches('input[type=text], textarea') && e.inputType !== 'deleteContentBackward') Sound.key(); }, true);
  return Sound;
})();

function buzz(ms = 60) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }
