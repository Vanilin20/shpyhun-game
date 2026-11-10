// Запуск усіх тестів: node tests/run.js  (або npm test). Сервер піднімається сам на порту 3999.
// restore.js сам керує сервером, тому йде без попередньо запущеного.
const { spawn, spawnSync } = require('child_process');
const path = require('path'), root = path.join(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));
const env = { ...process.env, PORT: '3999' };
const withServer = ['flow', 'leave', 'rounds', 'two-spies', 'no-repeat'], alone = ['restore'];
let bad = 0;
function run(name) {
  const r = spawnSync('node', [path.join(__dirname, name + '.js')], { cwd: root, env, encoding: 'utf8', timeout: 280000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const fails = out.split('\n').filter(l => l.startsWith('FAIL'));
  const ok = r.status === 0 && !fails.length;
  console.log((ok ? '✓ ' : '✗ ') + name + (ok ? '' : '\n' + (fails.join('\n') || out.slice(-400))));
  if (!ok) bad++;
}
(async () => {
  const srv = spawn('node', ['server.js'], { cwd: root, env, stdio: 'ignore' });
  await wait(800);
  withServer.forEach(run);
  srv.kill(); await wait(500);
  alone.forEach(run);
  console.log(bad ? `\nПровалено: ${bad}` : '\nУсі тести пройдені');
  process.exit(bad ? 1 : 0);
})();
