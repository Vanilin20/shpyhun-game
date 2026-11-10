// Подвійний тап «Далі» не має пропускати наступну фазу
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
  await post({ room, token: c.token, action: 'settings', settings: { drawing: false, items: false, scene: false, emoji: true, review: false, auction: false, horoscope: false, ads: false, headline: false } });
  await post({ room, token: c.token, action: 'start' });
  for (const p of P) await post({ room, token: p.token, action: 'ready' });
  for (let k = 0; k < 6; k++) for (const p of P) await post({ room, token: p.token, action: 'name', text: 'П' + k + p.id.slice(0, 2) });
  let v = await get(room, c.token); assert(v.phase === 'namesReveal', 'імена відкрито: ' + v.phase);
  // два швидкі «Далі» з однієї й тієї ж фази: другий запит має бути проігноровано
  const body = { room, token: c.token, action: 'next', ph: v.phase, stg: v.stage || '' };
  await post(body); await post(body);
  v = await get(room, c.token); assert(v.phase === 'questions', 'після подвійного тапу — допит, а не пропуск: ' + v.phase);
  // другий тап із новою фазою одразу після першого теж ігнорується (кулдаун)
  await post({ ...body, ph: 'questions', stg: v.stage || '' });
  v = await get(room, c.token); assert(v.phase === 'questions' && v.idx === 0, 'запит одразу після попереднього «Далі» ігнорується (хід не пропущено)');
  process.exit(bad ? 1 : 0);
})();
