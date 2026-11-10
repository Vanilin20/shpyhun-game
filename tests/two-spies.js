// два шпигуни: окремі здогадки, до 3 голосувань
const http = require('http');
const BASE = 'http://127.0.0.1:3999'; const V = {}, TOK = {}; let ROOM = '';
const post = b => new Promise(ok => { const d = JSON.stringify({ room: ROOM, ...b }); const r = http.request(BASE + '/api', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, res => { let s = ''; res.on('data', c => s += c); res.on('end', () => ok(JSON.parse(s))); }); r.end(d); });
const as = (id, b) => post({ token: TOK[id], ...b });
const sse = (q, cb) => http.get(BASE + '/events?' + q, res => { let buf = ''; res.on('data', c => { buf += c; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const ev = buf.slice(0, i); buf = buf.slice(i + 2); const m = ev.match(/^data: (.*)$/m); if (m) { const o = JSON.parse(m[1]); if (o.phase) cb(o); } } }); });
const wait = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { console.log((c ? 'ok: ' : 'FAIL: ') + m); if (!c) process.exitCode = 1; };
const RND = ['drawing', 'drawReveal', 'items', 'itemsDone', 'scene', 'sceneReveal', 'emoji', 'emojiReveal', 'clock', 'clockReveal', 'notes', 'notesReveal', 'review', 'auction', 'horoscope', 'horoscopeReveal', 'ads', 'adsReveal', 'headline', 'headlineReveal', 'reviewReveal', 'auctionReveal'];
(async () => {
  const c = await post({ action: 'create', name: 'Іван', used: [] }); ROOM = c.room; TOK[c.id] = c.token; sse(`room=${ROOM}&t=${c.token}`, v => V[c.id] = v);
  const ids = [c.id];
  for (const n of ['Оля', 'Петро', 'Марта', 'Тарас', 'Ліза', 'Богдан']) { const r = await post({ action: 'join', name: n }); ids.push(r.id); TOK[r.id] = r.token; sse(`room=${ROOM}&t=${r.token}`, v => V[r.id] = v); }
  await wait(300); const host = ids[0];
  let H, spies, town;
  const toPhase = async want => { for (let i = 0; i < 120 && !want.includes(H().phase); i++) { const ph = H().phase;
      if (ph === 'roles') for (const id of ids) await as(id, { action: 'ready' });
      else if (ph === 'names') await as(H().order[H().idx], { action: 'name', text: 'N' });
      else await as(host, { action: 'next' }); await wait(25); } return H().phase; };
  const voteOut = async target => { for (const id of ids) if (V[id].me.alive) await as(id, { action: 'vote', target: id === target ? ids.find(x => x !== id && V[x].me.alive) : target }); await wait(80); await as(host, { action: 'next' }); await wait(80); };
  async function newGame() {
    await as(host, { action: 'lobby' }); await wait(60);
    for (let t = 0; t < 30; t++) { await as(host, { action: 'start' }); await wait(80); if (!V[host].me.isSpy) break; await as(host, { action: 'lobby' }); await wait(40); }
    spies = ids.filter(id => V[id].me.isSpy); town = ids.filter(id => !V[id].me.isSpy);
    H = () => V[town[1]];
    await toPhase(['vote']);
  }
  // A: помилився один — вибуває лише він; 3 голосування; перед 3-м — ще раунд
  await newGame();
  assert(spies.length === 2, '2 шпигуни');
  await voteOut(town[1]);
  assert(H().phase === 'guess' && V[spies[0]].me.canGuess && V[spies[1]].me.canGuess, 'обидва можуть вгадувати');
  await as(spies[0], { action: 'guess', text: 'Не те' }); await wait(60);
  assert(H().phase === 'guess' && !V[spies[0]].me.canGuess && V[spies[0]].me.guessed === 'Не те', 'перший написав — чекаємо другого');
  await as(spies[1], { action: 'skip' }); await wait(60);
  assert(H().phase === 'verdict' && H().guessBy === spies[0], 'мирні оцінюють здогадку першого');
  for (const id of town) await as(id, { action: 'verdict', yes: false }); await wait(80);
  assert(H().phase === 'words' && /помилився/.test(H().notice) && !H().players.find(p => p.id === spies[0]).alive && H().players.find(p => p.id === spies[1]).alive, 'помилився — вибув лише він: ' + H().notice);
  await toPhase(['vote']); assert(H().voteNo === 2, 'голосування 2');
  await voteOut(town[2]);
  assert(H().phase === 'guess' && V[spies[1]].me.canGuess && !V[spies[0]].me.canGuess, 'тепер вгадує лише другий');
  await as(spies[1], { action: 'skip' }); await wait(80);
  assert(RND.includes(H().phase), 'перед 3-м голосуванням — випадковий раунд: ' + H().phase);
  const slots = H().slots; assert(slots.length === 3 && new Set(slots).size === 3, 'раунд, якого не було в партії: ' + slots.join(', '));
  assert(/не шпигун/.test(H().notice), 'банер у раунді: ' + H().notice);
  await toPhase(['vote']); assert(H().voteNo === 3, 'голосування 3');
  await voteOut(spies[1]);
  await as(spies[1], { action: 'skip' }); await wait(80);
  assert(H().phase === 'end' && H().end.winner === 'town' && H().end.reason === 'caught', 'обох шпигунів позбулись — мирні перемогли');
  // B: обидва пишуть: перший хибно, другий вгадав
  await newGame();
  await voteOut(town[1]);
  await as(spies[0], { action: 'guess', text: 'Хибно' }); await as(spies[1], { action: 'guess', text: 'Правильно' }); await wait(80);
  assert(H().phase === 'verdict', 'перша здогадка');
  const g1 = H().guessBy;
  for (const id of town) await as(id, { action: 'verdict', yes: false }); await wait(80);
  assert(H().phase === 'verdict' && H().guessBy !== g1, 'друга здогадка оцінюється окремо');
  for (const id of town) await as(id, { action: 'verdict', yes: true }); await wait(80);
  assert(H().phase === 'end' && H().end.winner === 'spy' && H().end.reason === 'guessed', 'другий вгадав — шпигуни перемогли');
  // C: обидва помилились
  await newGame();
  await voteOut(town[1]);
  for (const s of spies) await as(s, { action: 'guess', text: 'X' }); await wait(60);
  for (let k = 0; k < 2; k++) { for (const id of town) await as(id, { action: 'verdict', yes: false }); await wait(80); }
  assert(H().phase === 'end' && H().end.winner === 'town' && H().end.reason === 'wrong', 'обидва помилились — мирні перемогли');
  // D: шпигуни пережили 3 голосування
  await newGame();
  for (let k = 0; k < 3; k++) { await voteOut(town[k + 1]); for (const s of spies) await as(s, { action: 'skip' }); await wait(60); if (H().phase !== 'end') await toPhase(['vote', 'end']); }
  assert(H().phase === 'end' && H().end.winner === 'spy', 'шпигуни вціліли: ' + (H().end && H().end.reason));
  process.exit();
})();
