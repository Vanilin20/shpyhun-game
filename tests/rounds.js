// 2 випадкові раунди: після імен і перед голосуванням
const http = require('http');
const BASE = 'http://127.0.0.1:3999'; const V = {}, TOK = {}; let ROOM = '';
const post = b => new Promise(ok => { const d = JSON.stringify({ room: ROOM, ...b }); const r = http.request(BASE + '/api', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, res => { let s = ''; res.on('data', c => s += c); res.on('end', () => ok(JSON.parse(s))); }); r.end(d); });
const as = (id, b) => post({ token: TOK[id], ...b });
const sse = (q, cb) => http.get(BASE + '/events?' + q, res => { let buf = ''; res.on('data', c => { buf += c; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const ev = buf.slice(0, i); buf = buf.slice(i + 2); const m = ev.match(/^data: (.*)$/m); if (m) { const o = JSON.parse(m[1]); if (o.phase || o.noRoom) cb(o); } } }); });
const wait = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { console.log((c ? 'ok: ' : 'FAIL: ') + m); if (!c) process.exitCode = 1; };
const ROUND_OF = { drawing: 'drawing', drawReveal: 'drawing', items: 'items', itemsDone: 'items', scene: 'scene', sceneReveal: 'scene', emoji: 'emoji', emojiReveal: 'emoji', review: 'review', reviewReveal: 'review', auction: 'auction', auctionReveal: 'auction', horoscope: 'horoscope', horoscopeReveal: 'horoscope', ads: 'ads', adsReveal: 'ads', headline: 'headline', headlineReveal: 'headline' };
(async () => {
  const c = await post({ action: 'create', name: 'Іван', used: [] }); ROOM = c.room; TOK[c.id] = c.token; sse(`room=${ROOM}&t=${c.token}`, v => V[c.id] = v);
  const ids = [c.id];
  for (const n of ['Оля', 'Петро']) { const r = await post({ action: 'join', name: n }); ids.push(r.id); TOK[r.id] = r.token; sse(`room=${ROOM}&t=${r.token}`, v => V[r.id] = v); }
  await wait(300); const H = () => V[ids[1]], host = ids[0];
  async function playGame() {
    await as(host, { action: 'start' }); await wait(60);
    const seq = [];
    for (let i = 0; i < 80 && H().phase !== 'vote'; i++) {
      const ph = H().phase, r = ROUND_OF[ph] || ph;
      if (seq[seq.length - 1] !== r) seq.push(r);
      if (ph === 'roles') for (const id of ids) await as(id, { action: 'ready' });
      else if (ph === 'names') await as(H().order[H().idx], { action: 'name', text: 'N' });
      else await as(host, { action: 'next' });
      await wait(30);
    }
    await as(host, { action: 'lobby' }); await wait(50);
    return seq;
  }
  const games = [];
  for (let g = 0; g < 6; g++) {
    const seq = await playGame();
    const ok = seq.length === 7 && seq[0] === 'roles' && seq[1] === 'names' && seq[2] === 'namesReveal' && ROUND_OF[seq[3]] && seq[4] === 'questions' && ROUND_OF[seq[5]] && seq[6] === undefined || false;
    const r1 = seq[3], r2 = seq[5];
    assert(seq[1] === 'names' && seq[2] === 'namesReveal' && ROUND_OF[r1] && seq[4] === 'questions' && ROUND_OF[r2] && seq.length === 6 && r1 !== r2, `партія ${g + 1}: ${seq.slice(1).join(' → ')} → голосування`);
    games.push([r1, r2]);
  }
  for (let g = 1; g < games.length; g++) assert(!games[g].some(r => games[g - 1].includes(r)), `партія ${g + 1} не повторює раунди попередньої`);
  // лише один увімкнений — стоїть перед голосуванням
  await as(host, { action: 'settings', settings: { drawing: false, items: false, scene: false, emoji: true, review: false, auction: false, horoscope: false, ads: false, headline: false } });
  const one = await playGame();
  assert(one[3] === 'questions' && one[4] === 'emoji', 'один раунд — перед голосуванням: ' + one.slice(1).join(' → '));
  await as(host, { action: 'settings', settings: { emoji: false } });
  const none = await playGame();
  assert(none.slice(1).join() === 'names,namesReveal,questions', 'без раундів: імена → допит → голосування');
  process.exit();
})();
