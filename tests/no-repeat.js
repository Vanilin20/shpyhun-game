// одна кімната, 12 партій поспіль: раунди не повторюються з попередньою партією; локації не повторюються
const http = require('http'); const B = 'http://127.0.0.1:3999';
const post = b => new Promise(ok => { const d = JSON.stringify(b); const r = http.request(B + '/api', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, res => { let s = ''; res.on('data', c => s += c); res.on('end', () => ok(JSON.parse(s))); }); r.end(d); });
const get = (room, t) => new Promise(ok => http.get(`${B}/state?room=${room}&t=${t}`, r => { let s = ''; r.on('data', x => s += x); r.on('end', () => ok(JSON.parse(s))); }));
(async () => {
  const c = await post({ action: 'create', name: 'А', used: [] }); const room = c.room; const P = [c];
  for (const n of ['Б', 'В']) P.push(await post({ room, action: 'join', name: n }));
  for (const p of P) http.get(`${B}/events?room=${room}&t=${p.token}`, r => r.resume());
  await new Promise(r => setTimeout(r, 100));
  let prev = [], bad = 0; const locs = new Set(); let dupLoc = 0;
  for (let g = 0; g < 12; g++) {
    await post({ room, token: c.token, action: 'start' });
    for (const p of P) await post({ room, token: p.token, action: 'ready' });
    const seen = [];
    for (let i = 0; i < 80; i++) {
      const v = await get(room, c.token);
      if (['drawing', 'items', 'scene', 'emoji', 'clock', 'notes'].includes(v.phase) && !seen.includes(v.phase)) seen.push(v.phase);
      if (v.phase === 'vote' || v.phase === 'end') { if (i === 0) {} break; }
      if (v.phase === 'names') { const p = P.find(x => x.id === v.order[v.idx]); await post({ room, token: p.token, action: 'name', text: 'X' }); continue; }
      await post({ room, token: c.token, action: 'next' });
    }
    const loc = (await get(room, P.find(p => true).token)).me.location; if (loc) { if (locs.has(loc)) dupLoc++; locs.add(loc); }
    const rep = seen.filter(k => prev.includes(k));
    if (rep.length) bad++;
    console.log(g + 1, seen.join('+'), rep.length ? 'ПОВТОР ' + rep : '');
    prev = seen;
    await post({ room, token: c.token, action: 'lobby' });
  }
  console.log('повторів раундів:', bad, '· повторів локацій:', dupLoc); process.exit();
})();
