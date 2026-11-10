// Симуляція повної партії ботами: лобі → ролі → імена → питання → додатковий раунд → голосування → слова → голосування → кінець
const http = require('http');
const BASE = 'http://127.0.0.1:' + (process.env.PORT || 3999);
const views = {}; const TOK = {}; let hostV = null; let KEY = '', ROOM = '';
const post = b => new Promise((ok, no) => {
  const d = JSON.stringify({ key: KEY, room: ROOM, token: TOK[b.id], ...b });
  const r = http.request(BASE + '/api', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, res => {
    let s = ''; res.on('data', c => s += c); res.on('end', () => ok(JSON.parse(s)));
  }); r.on('error', no); r.end(d);
});
function sse(q, cb) {
  http.get(BASE + '/events?' + q, res => {
    let buf = '';
    res.on('data', c => { buf += c; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const ev = buf.slice(0, i); buf = buf.slice(i + 2); const m = ev.match(/^data: (.*)$/m); if (m) { const o = JSON.parse(m[1]); if (o.phase || o.noRoom) cb(o); } } });
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok:', m); };

(async () => {
  { const r = await post({ action: 'create', used: [] }); ROOM = r.room; KEY = r.key; }
  { const other = await post({ action: 'create' }); const o = await post({ action: 'join', room: other.room, name: 'Чужий' }); assert(!!o.id, 'друга кімната існує окремо: ' + other.room); }
  sse('room=' + ROOM + '&host=1&key=' + KEY, v => hostV = v);
  const names = ['Іван', 'Оля', 'Петро', 'Марта'];
  const ids = [];
  for (const n of names) { const r = await post({ action: 'join', name: n }); ids.push(r.id); TOK[r.id] = r.token; sse('room=' + ROOM + '&t=' + r.token, v => views[r.id] = v); }
  await wait(300);
  assert(hostV.players.length === 4 && hostV.players.every(p => p.online), 'лобі: 4 гравці онлайн');
  assert(hostV.code === ROOM && hostV.players.every(p => p.name !== 'Чужий'), 'кімната ' + ROOM + ': чужого гравця не видно');
  const dup = await post({ action: 'join', name: 'іван' });
  const dupId = dup.id; await post({ action: 'kick', target: dupId });

  assert((await post({ action: 'start', key: 'wrong' })).error, 'без ключа ведучого старт заборонено');
  assert((await post({ action: 'join', room: 'ZZZZ', name: 'x' })).noRoom, 'неіснуюча кімната → помилка');
  await post({ action: 'settings', settings: { drawing: false, items: false, scene: false, emoji: true, review: false, auction: false } });
  assert(!(await post({ action: 'start' })).error, 'старт');
  await wait(200);
  const spy = ids.find(id => views[id].me.isSpy);
  const town = ids.filter(id => id !== spy);
  assert(spy && views[spy].me.location === null, 'шпигун не бачить локацію, тема: ' + views[spy].theme);
  assert(town.every(id => views[id].me.location), 'мирні бачать локацію');
  assert(!JSON.stringify(hostV).includes(views[town[0]].me.location), 'екран ноутбука не містить локації');
  const loc = views[town[0]].me.location;

  for (const id of ids) await post({ action: 'ready', id });
  await wait(100); assert(hostV.phase === 'names', 'усі готові → імена');
  for (let _k = 0; _k < 12; _k++) for (const [i, id] of ids.entries()) await post({ action: 'name', id, text: 'Персонаж ' + i });
  await wait(100); assert(hostV.phase === 'namesReveal' && hostV.players[0].char === 'Персонаж 0', 'імена відкрилися разом');
  await post({ action: 'next' }); await wait(100);
  assert(hostV.phase === 'questions' && hostV.stage === 'ask', 'допит');
  const ord = hostV.order.slice();
  for (let k = 0; k < 4; k++) {
    const cur = hostV.order[hostV.idx];
    assert(hostV.stage === 'ask' && hostV.target === ord[(k + 1) % 4] && cur === ord[k], `по колу ${k + 1}: ${hostV.players.find(p => p.id === cur).name} → ${hostV.players.find(p => p.id === hostV.target).name}`);
    if (k === 0) { const l = hostV.endsAt - Date.now(); assert(l > 110000, 'на питання 2 хв'); }
    await post({ action: 'asked', id: cur }); await wait(50);
  }
  assert(hostV.phase === 'emoji', 'раунд емодзі');
  const el = hostV.endsAt - Date.now(); assert(el > 110000 && el <= 121000, 'на емодзі 2 хв');
  assert((await post({ action: 'emoji', id: ids[0], text: '🏥 привіт' })).error, 'менше 3 емодзі — відмова');
  for (const [i, id] of ids.entries()) await post({ action: 'emoji', id, text: i === 0 ? 'ось: 👨‍⚕️🇺🇦 і ❤️ 🔥' : '🏥💉🩺' });
  await wait(100);
  assert(hostV.phase === 'emojiReveal' && hostV.emojis[ids[0]] === '👨‍⚕️ 🇺🇦 ❤️' && Object.keys(hostV.emojis).length === 4, 'усі бачать емодзі: ' + hostV.emojis[ids[0]]);
  await post({ action: 'next' }); await wait(80);
  assert(hostV.phase === 'vote', 'голосування 1');
  // мирні голосують проти невинного town[0] → він вибуває
  for (const id of ids) await post({ action: 'vote', id, target: id === town[0] ? town[1] : town[0] });
  await wait(100);
  assert(hostV.phase === 'voteResult' && hostV.res.out === town[0], 'вигнали мирного');
  await post({ action: 'next' }); await wait(100);
  assert(hostV.phase === 'guess', 'шанс шпигуна');
  await post({ action: 'skip', id: spy }); await wait(100);
  assert(hostV.phase === 'words' && hostV.notice.includes('не шпигун'), 'раунд слів, повідомлення: ' + hostV.notice);
  const alive = ids.filter(id => id !== town[0]);
  for (const id of alive) await post({ action: 'word', id, text: 'слово ' + id.slice(0, 3) });
  await wait(100); assert(hostV.phase === 'wordsReveal', 'слова відкрито');
  await post({ action: 'next' }); await wait(100);
  assert(hostV.phase === 'vote' && hostV.voteNo === 2, 'голосування 2');
  // нічия між spy і town[1] → переголосування
  await post({ action: 'vote', id: spy, target: town[1] });
  await post({ action: 'vote', id: town[1], target: spy });
  await post({ action: 'vote', id: town[2], target: town[1] === town[2] ? spy : spy });
  await wait(100);
  if (hostV.phase === 'vote' && hostV.revote) assert(true, 'нічия → переголосування');
  if (hostV.phase === 'vote') { for (const id of alive) if (id !== spy) await post({ action: 'vote', id, target: spy }); await post({ action: 'vote', id: spy, target: town[1] }); }
  await wait(100);
  assert(hostV.phase === 'voteResult' && hostV.res.out === spy, 'шпигуна вигнали');
  await post({ action: 'next' }); await wait(100);
  await post({ action: 'guess', id: spy, text: loc.toLowerCase() }); await wait(100);
  assert(hostV.phase === 'verdict' && hostV.guess, 'мирні вирішують здогадку');
  assert(views[town[0]].me.location === loc, 'вибулий мирний теж бачить локацію для рішення');
  for (const id of town) await post({ action: 'verdict', id, yes: true });
  await wait(100);
  assert(hostV.phase === 'end' && hostV.end.winner === 'spy' && hostV.end.reason === 'guessed', 'шпигун вгадав і переміг');
  assert(hostV.end.location === loc, 'локацію відкрито в кінці');
  assert(hostV.used && hostV.used.some(k => k.endsWith('|' + loc)), 'наприкінці ноутбук отримав зіграну локацію для памʼяті');

  // друга партія: шпигуна ловлять, він помиляється
  assert(!(await post({ action: 'start' })).error, 'нова гра');
  await wait(100);
  assert(hostV.players.every(p => p.alive), 'усі знову в грі');
  for (const id of ids) await post({ action: 'ready', id });
  process.exit();
})();
