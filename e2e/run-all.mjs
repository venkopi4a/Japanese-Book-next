// Builds the app and runs every browser test. Usage: npm run e2e
import { spawnSync } from 'node:child_process';
const BASE = process.env.APP_BASE || '/Japanese-Book-next/';
const sh = process.platform === 'win32';
const run = (cmd, args, env = {}) => spawnSync(cmd, args, { stdio: 'inherit', shell: sh, env: { ...process.env, ...env } });

console.log('Building the app and the test variant...');
if (run('npm', ['run', 'build'], { VITE_BASE: BASE }).status) process.exit(1);
// the test variant makes photo recognition fail on purpose, to check the error screen
if (run('npx', ['vite', 'build', '--outDir', 'e2e/.dist-fail', '--emptyOutDir'], { VITE_BASE: BASE, VITE_RECOGNISER: 'fail' }).status) process.exit(1);

let failed = 0;
for (const suite of ['e2e.mjs', 'e2e-kana.mjs', 'e2e-photo.mjs', 'e2e-fail.mjs', 'offline.mjs']) {
  const p = spawnSync('node', ['e2e/' + suite], { encoding: 'utf8', shell: sh, timeout: 280000, env: process.env });
  const lines = (p.stdout || '').split('\n');
  const pass = lines.filter((l) => l.startsWith('PASS')).length;
  const fail = lines.filter((l) => l.startsWith('FAIL'));
  console.log(`${suite}: ${pass} passed, ${fail.length} failed${p.status === null ? ' (timed out)' : ''}`);
  fail.forEach((l) => console.log('  ' + l.slice(0, 220)));
  if (fail.length || p.status || pass === 0) failed++;
}
process.exit(failed ? 1 : 0);
