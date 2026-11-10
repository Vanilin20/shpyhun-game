// Керування ведучого в допиті: пауза, +час, спочатку, назад
const http = require('http');
const BASE = 'http://127.0.0.1:3999';
const post = b => new Promise(ok => { const d = JSON.stringify(b); const r = http.request(BASE + '/api', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, res => { let s = ''; res.on('data', c => s += c); res.on('end', () => ok(JSON.parse(s))); }); r.end(d); });
const get = (room, t) => new Promise(ok => http.get(`${BASE}/state?room=${room}&t=${t}`, r => { let s = ''; r.on('data', x => s += x); r.on('end', () => ok(JSON.parse(s))); }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0; const assert = (c, m) => { console.log((c ? 'ok: ' : 'FAIL: ') + m); if (!c) bad++; };
(async () => {
  const c = await post({ action: 'create', name: 'А', used: [] }); const room = c.room;
  const P = [c, await post({ room, action: 'join', name: 'Б' }), await post({ room, action: 'join', name: 'В' })];
  for (const p of P) http.get(`${BASE}/events?room=${room}&t=${p.token}`, r => r.resume());
  await sleep(300);
  await post({ room, token: c.token, action: 'settings', settings: { drawing: false, items: false, scene: false, emoji: false, review: false, auction: false, horoscope: false, ads: false, headline: false } });
  await post({ room, token: c.token, action: 'start' });
  for (const p of P) await post({ room, token: p.token, action: 'ready' });
  for (let k = 0; k < 6; k++) for (const p of P) await post({ room, token: p.token, action: 'name', text: 'П' + k + p.id.slice(0, 2) });
  await post({ room, token: c.token, action: 'next' });
  let v = await get(room, c.token); assert(v.phase === 'questions' && v.idx === 0, 'допит, хід 1');
  const ends0 = v.endsAt;
  await post({ room, token: c.token, action: 'plus' }); v = await get(room, c.token);
  assert(v.endsAt - ends0 > 55000, '+1 хв подовжує таймер');
  await post({ room, token: c.token, action: 'pause' }); v = await get(room, c.token);
  assert(v.paused && !v.endsAt && v.pausedLeft > 100, 'пауза зупиняє таймер: ' + v.pausedLeft + ' с');
  await post({ room, token: P[1].token, action: 'pause' }); // не ведучий — нічого
  await post({ room, token: c.token, action: 'plus' }); v = await get(room, c.token);
  assert(v.pausedLeft > 160, '+1 хв під час паузи додає до залишку: ' + v.pausedLeft);
  await post({ room, token: c.token, action: 'resume' }); v = await get(room, c.token);
  assert(!v.paused && v.endsAt > Date.now() + 100000, 'продовжити запускає таймер');
  await post({ room, token: c.token, action: 'next' }); v = await get(room, c.token); assert(v.idx === 1, 'наступний хід');
  await post({ room, token: c.token, action: 'qback' }); v = await get(room, c.token); assert(v.idx === 0 && v.stage === 'ask', 'назад — до попередньої пари');
  await post({ room, token: c.token, action: 'next' }); await post({ room, token: c.token, action: 'qrepeat' }); v = await get(room, c.token);
  assert(v.idx === 1 && v.stage === 'ask' && v.endsAt > Date.now() + 100000, 'спочатку — той самий хід із новим таймером');
  process.exit(bad ? 1 : 0);
})();
