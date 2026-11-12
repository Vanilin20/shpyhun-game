// три шпигуни (9 гравців): перше голосування вигонить двох, далі по одному
const http = require('http');
const BASE = 'http://127.0.0.1:3999'; const V = {}, TOK = {}; let ROOM = '';
const post = b => new Promise(ok => { const d = JSON.stringify({ room: ROOM, ...b }); const r = http.request(BASE + '/api', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, res => { let s = ''; res.on('data', c => s += c); res.on('end', () => ok(JSON.parse(s))); }); r.end(d); });
const as = (id, b) => post({ token: TOK[id], ...b });
const sse = (q, cb) => http.get(BASE + '/events?' + q, res => { let buf = ''; res.on('data', c => { buf += c; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const ev = buf.slice(0, i); buf = buf.slice(i + 2); const m = ev.match(/^data: (.*)$/m); if (m) { const o = JSON.parse(m[1]); if (o.phase) cb(o); } } }); });
const wait = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { console.log((c ? 'ok: ' : 'FAIL: ') + m); if (!c) process.exitCode = 1; };
const NAMES = ['Іван', 'Оля', 'Петро', 'Марта', 'Тарас', 'Ліза', 'Богдан', 'Ярина', 'Макс'];
(async () => {
  const c = await post({ action: 'create', name: NAMES[0], used: [] }); ROOM = c.room; TOK[c.id] = c.token; sse(`room=${ROOM}&t=${c.token}`, v => V[c.id] = v);
  const ids = [c.id];
  for (const n of NAMES.slice(1)) { const r = await post({ action: 'join', name: n }); ids.push(r.id); TOK[r.id] = r.token; sse(`room=${ROOM}&t=${r.token}`, v => V[r.id] = v); }
  await wait(400); const host = ids[0];
  await as(host, { action: 'settings', settings: { drawing: false, items: false, scene: false, emoji: false, review: false, auction: false, horoscope: false, ads: false, headline: false } });
  let spies, town; const H = () => V[host];
  const toPhase = async want => { for (let i = 0; i < 150 && !want.includes(H().phase); i++) { const ph = H().phase;
      if (ph === 'roles') for (const id of ids) await as(id, { action: 'ready' });
      else if (ph === 'names') await as(H().order[H().idx], { action: 'name', text: 'N' });
      else await as(host, { action: 'next' }); await wait(25); } return H().phase; };
  const vote = async plan => { for (const id of ids) if (V[id].me.alive) { const t = plan(id); if (t && t !== id) await as(id, { action: 'vote', target: t }); } await wait(150); };
  await as(host, { action: 'start' }); await wait(200);
  spies = ids.filter(id => V[id].me.isSpy); town = ids.filter(id => !V[id].me.isSpy);
  assert(spies.length === 3, '9 гравців — 3 шпигуни');
  assert(V[spies[0]].me.partners.length === 2, 'шпигуни знають одне одного');
  await toPhase(['vote']);
  assert(H().voteNo === 1 && H().need === 2, 'перше голосування вигонить двох');
  // 5 голосів проти town[0], 4 проти town[1]
  const a = town[0], b = town[1], alive = ids.filter(id => id !== a && id !== b);
  await vote(id => (id === a ? b : id === b ? a : (alive.indexOf(id) % 2 ? b : a)));
  assert(H().phase === 'voteResult' && H().res.outs.length === 2 && H().res.outs.includes(a) && H().res.outs.includes(b), 'вибули обидва: ' + JSON.stringify(H().res && H().res.outs));
  await toPhase(['guess']);
  for (const s of spies) await as(s, { action: 'skip' }); await wait(150);
  await toPhase(['words', 'vote', 'end']);
  await toPhase(['vote']);
  assert(H().voteNo === 2 && H().need === 1, 'друге голосування — по одному');
  // шпигуни проти мирного, решта проти шпигуна spies[0]
  const t2 = town[2];
  await vote(id => (spies.includes(id) ? t2 : spies[0]));
  assert(H().phase === 'voteResult' && H().res.outs.length === 1, 'вибув один: ' + JSON.stringify(H().res && H().res.outs));
  // нічия на останнє місце першого голосування: нова гра
  await as(host, { action: 'lobby' }); await wait(100);
  await as(host, { action: 'start' }); await wait(200);
  spies = ids.filter(id => V[id].me.isSpy); town = ids.filter(id => !V[id].me.isSpy);
  await toPhase(['vote']);
  // x: 4 голоси, y: 2, z: 2, w: 1 → x вибуває, y/z — нічия на друге місце
  const x = ids[1], y = ids[2], z = ids[3], w = ids[4], o = ids.filter(i => ![x, y, z, w].includes(i));
  const plan = { [x]: y, [y]: x, [z]: x, [w]: x, [o[0]]: y, [o[1]]: z, [o[2]]: z, [o[3]]: x, [o[4]]: w };
  await vote(id => plan[id]);
  assert(H().phase === 'vote' && H().need === 1 && H().cands && H().cands.length === 2 && H().cands.includes(y) && H().cands.includes(z), 'нічия на друге місце → переголосування між y і z');
  assert(!H().players.find(p => p.id === x).alive, 'x вигнаний одразу');
  await vote(id => (id === y ? z : y));
  assert(H().phase === 'voteResult' && H().res.outs.length === 2 && H().res.outs.includes(x) && H().res.outs.includes(y), 'підсумок: вибули x і y: ' + JSON.stringify(H().res && H().res.outs));
  process.exit(process.exitCode || 0);
})();
