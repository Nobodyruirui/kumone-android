// 出界面截图（桌面浏览器验收用）。
//
//   node test/shots.mjs favorites mine-drawer
//
// 每个状态一张：探针页把 App 驱动到那个状态并停住，Edge headless 截的就是那一帧。
// 输出到 .scratch/shots/。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const PORT = 8100;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = join(repo, '.scratch', 'shots');

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
].find((p) => existsSync(p));

if (!EDGE) {
  console.log('SKIP 未找到 Edge/Chrome');
  process.exit(0);
}

const states = process.argv.slice(2).length ? process.argv.slice(2) : ['favorites', 'mine-drawer'];
mkdirSync(OUT, { recursive: true });

for (const state of states) {
  const profile = join(
    process.env.TEMP || '.',
    `edge-kumone-shot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const file = join(OUT, `${state}.png`);
  const res = spawnSync(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    '--virtual-time-budget=14000',
    `--user-data-dir=${profile}`,
    '--window-size=430,880',
    `--screenshot=${file}`,
    `${BASE}/test/fixtures/probe-shot.html?state=${state}`
  ], { encoding: 'utf8', timeout: 120000 });

  try { if (existsSync(profile)) rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch {}

  console.log(`${state} → ${existsSync(file) ? 'OK ' + file : 'FAIL'}` + (res.error ? ' :: ' + res.error.message : ''));
}
