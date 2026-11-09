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
function av(p, cls = '') {
  const n = (p && p.name) || '?';
  return `<span class="av ${cls}" style="--h:${hueOf(n)}">${esc([...n.trim()][0] || '?').toUpperCase()}</span>`;
}

// ---------- зв'язок із сервером: SSE, а якщо проксі його гальмує — опитування ----------
function Live({ room, token = '', key = '', onState, onNoRoom }) {
  let es = null, poll = null, lastAct = 0, got = false, startedAt = Date.now(), dead = false;
  const qs = `room=${encodeURIComponent(room)}&t=${encodeURIComponent(token)}&key=${encodeURIComponent(key)}`;
  const handle = v => {
    got = true; lastAct = Date.now();
    if (v.noRoom) { stop(); onNoRoom && onNoRoom(); return; }
    onState(v);
  };
  const pollOnce = () => fetch('/state?' + qs, { cache: 'no-store' }).then(r => r.json()).then(handle).catch(() => {});
  function startPoll() { if (es) { es.close(); es = null; } if (!poll) { poll = setInterval(pollOnce, 1500); pollOnce(); } }
  function open() {
    if (dead) return;
    es = new EventSource('/events?' + qs);
    es.onmessage = e => handle(JSON.parse(e.data));
    es.addEventListener('ping', () => { lastAct = Date.now(); });
  }
  const watchdog = setInterval(() => {
    if (poll || dead) return;
    if ((!got && Date.now() - startedAt > 6000) || (got && Date.now() - lastAct > 40000)) startPoll();
  }, 2000);
  function stop() { dead = true; if (es) es.close(); if (poll) clearInterval(poll); clearInterval(watchdog); }
  open();
  return { stop, refresh: () => { if (poll) pollOnce(); } };
}

async function postApi(body) {
  try {
    const r = await fetch('/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await r.json();
  } catch (e) { return { error: "Немає зв'язку з сервером. Перевір інтернет." }; }
}

// ---------- таймер-кільце ----------
const Timer = (() => {
  let total = 0, lastEnds = 0, off = 0, ends = 0;
  function set(st) {
    off = st.now - Date.now();
    if (st.endsAt !== lastEnds) { lastEnds = st.endsAt; ends = st.endsAt; total = st.endsAt ? Math.max(1, st.endsAt - st.now) : 0; }
  }
  function left() { return ends ? Math.max(0, ends - Date.now() - off) : null; }
  function html() { return `<div class="ring" id="ring" hidden><svg viewBox="0 0 46 46"><circle class="bg" cx="23" cy="23" r="20"/><circle class="fg" cx="23" cy="23" r="20" stroke-dasharray="125.66" stroke-dashoffset="0"/></svg><span></span></div>`; }
  function tick() {
    const el = $('#ring'); if (!el) return;
    const l = left();
    el.hidden = l == null;
    if (l == null) return;
    const s = Math.ceil(l / 1000);
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
  items: 'Предмети', itemsDone: 'Предмети', vote: 'Голосування', voteResult: 'Вирок', guess: 'Шанс шпигуна', verdict: 'Здогадка',
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
  words(st) {
    return `<div class="cards">${R.alive(st).map((p, i) => `
      <div class="card" style="animation-delay:${i * .12}s"><div class="paper" style="${rot(i)}">
        <div class="who">${av(p)}${esc(p.char || p.name)}</div><div class="big">${esc((st.words || {})[p.id] || '—')}</div></div></div>`).join('')}</div>`;
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
        ${owner ? `<span class="by">${av(owner)}${esc(owner.char || owner.name)}</span>` : ''}</${tag}>`;
    }).join('')}</div>`;
  },
  duel(st, meId) {
    const a = R.P(st, st.order[st.idx]), b = st.target ? R.P(st, st.target) : null;
    const nameOf = p => p.id === meId ? 'Ти' : esc(p.name);
    return `<div class="duel">
      <div class="who">${av(a, 'lg')}${nameOf(a)}<small>${esc(a.char)}</small></div>
      <div class="arrow">${b ? '→' : '…'}</div>
      <div class="who">${b ? `${av(b, 'lg')}${nameOf(b)}<small>${esc(b.char)}</small>` : '<span class="av lg" style="background:var(--panel2)">?</span><small>обирає</small>'}</div></div>`;
  },
  order(st) {
    return `<div class="order">${st.order.map((id, i) => `<span class="${i === st.idx ? 'cur' : i < st.idx ? 'past' : ''}">${esc(R.P(st, id).name)}</span>`).join('')}</div>`;
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
    return `<div class="dots">${ids.map(id => { const p = R.P(st, id); return `<span title="${esc(p.name)}">${av(p, done.has(id) ? 'on' : '')}</span>`; }).join('')}</div>`;
  },
  endReveal(st) {
    const e = st.end, spies = e.spyIds.map(id => R.P(st, id));
    return `<div class="reveal3">
      <div class="paper" style="${rot(0)}"><div class="lbl">Тема</div><div class="val">${esc(st.theme)}</div>
        <div class="lbl">Локація</div><div class="val">${esc(e.location)}</div></div>
      <div class="paper" style="${rot(1)}"><div class="lbl">${spies.length > 1 ? 'Шпигуни' : 'Шпигун'}</div>
        ${spies.map(spy => `<div class="val" style="display:flex;align-items:center;gap:10px;margin-bottom:4px">${av(spy, 'lg')}<span>${esc(spy.name)}${spy.char ? `<br><span style="font:600 14px var(--body);opacity:.7">«${esc(spy.char)}»</span>` : ''}</span></div>`).join('')}
        ${e.guess ? `<div class="lbl" style="margin-top:12px">Здогадка${e.guessBy ? ' · ' + esc(R.P(st, e.guessBy).name) : ''}</div><div class="val" style="font-size:20px">«${esc(e.guess)}»</div>` : ''}</div></div>`;
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
function buzz(ms = 60) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }
