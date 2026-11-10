// вихід посеред гри
const http = require('http');
const BASE = 'http://127.0.0.1:3999'; const V = {}, TOK = {}; let ROOM = '';
const post = b => new Promise(ok => { const d = JSON.stringify({ room: ROOM, ...b }); const r = http.request(BASE + '/api', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, res => { let s = ''; res.on('data', c => s += c); res.on('end', () => ok(JSON.parse(s))); }); r.end(d); });
const as = (id, b) => post({ token: TOK[id], ...b });
const sse = (q, cb) => http.get(BASE + '/events?' + q, res => { let buf = ''; res.on('data', c => { buf += c; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const ev = buf.slice(0, i); buf = buf.slice(i + 2); const m = ev.match(/^data: (.*)$/m); if (m) { const o = JSON.parse(m[1]); if (o.phase || o.noRoom) cb(o); } } }); });
const wait = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { console.log((c ? 'ok: ' : 'FAIL: ') + m); if (!c) process.exitCode = 1; };
async function room(n) {
  const c = await post({ action: 'create', name: 'Іван', used: [] }); ROOM = c.room; TOK[c.id] = c.token; sse(`room=${ROOM}&t=${c.token}`, v => V[c.id] = v);
  const ids = [c.id];
  for (let k = 1; k < n; k++) { const r = await post({ action: 'join', name: 'Гравець' + k }); ids.push(r.id); TOK[r.id] = r.token; sse(`room=${ROOM}&t=${r.token}`, v => V[r.id] = v); }
  await wait(300); return ids;
}
(async () => {
  // 1. ведучий виходить у лобі
  let ids = await room(3);
  await as(ids[0], { action: 'leave' }); await wait(100);
  assert(V[ids[1]].hostId === ids[1] && V[ids[1]].amHost && V[ids[1]].players.length === 2, 'ведучий вийшов з лобі — ведучим став інший');
  // 2. ведучий (мирний) виходить посеред допиту, 5 гравців
  for (let t = 0; t < 20; t++) {
    ids = await room(5);
    await as(ids[0], { action: 'settings', settings: { drawing: false, items: false, scene: false, emoji: true, review: false, auction: false, horoscope: false, ads: false, headline: false } });
    await as(ids[0], { action: 'start' }); await wait(100);
    if (!V[ids[0]].me.isSpy) break;
  }
  const H = () => V[ids[1]];
  for (const id of ids) await as(id, { action: 'ready' });
  for (let _k = 0; _k < 12; _k++) for (const id of ids) await as(id, { action: 'name', text: 'П' + id.slice(0, 2) });
  await wait(100); await as(ids[0], { action: 'next' }); await wait(100);
  assert(V[ids[0]].phase === 'questions', 'допит');
  const before = V[ids[0]].order.slice();
  assert(!(await as(ids[0], { action: 'leave' })).error, 'ведучий виходить посеред гри'); await wait(150);
  assert(H().phase === 'questions' && !H().order.includes(ids[0]) && H().order.length === 4, 'гра триває без нього, черга: 4');
  assert(H().order[(H().idx + 1) % 4] === H().target && H().target !== ids[0], 'коло перебудовано');
  const nh = H().hostId; assert(nh && nh !== ids[0] && V[nh].amHost, 'новий ведучий: ' + nh);
  assert(H().players.find(p => p.id === ids[0]).alive === false, 'вийшлий позначений як вибулий');
  assert((await as(ids[0], { action: 'ready' })).error === undefined, 'старий токен нічого не ламає');
  // доводимо до голосування
  while (H().phase !== 'vote') {
    const ph = H().phase;
    if (ph === 'drawing') for (const id of ids.slice(1)) await as(id, { action: 'draw', img: 'data:image/jpeg;base64,AAAA' });
    else if (ph === 'emoji') for (const id of ids.slice(1)) await as(id, { action: 'emoji', text: '🚀🌙⭐' });
    else await as(nh, { action: 'next' });
    await wait(40);
  }
  assert(true, 'дійшли до голосування з 4 гравцями');
  // 3. шпигун виходить → партію зупинено
  const spy = ids.slice(1).find(id => V[id].me.isSpy);
  await as(spy, { action: 'leave' }); await wait(150);
  const other = ids.find(id => id !== spy && id !== ids[0]);
  assert(V[other].phase === 'lobby' && /партію зупинено/.test(V[other].notice) && V[other].players.length === 3, 'шпигун вийшов — лобі: ' + V[other].notice);
  process.exit();
})();
