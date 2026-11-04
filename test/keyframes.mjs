// 出左滑返回的关键帧图（桌面浏览器验收用）。
//
//   node test/keyframes.mjs            # 默认 0 / 25 / 50 / 75
//
// 每个进度一张：探针页把手指按住不放，Edge headless 截的就是那一帧。
// 输出到 .scratch/frames/。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const PORT = 8100;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = join(repo, '.scratch', 'frames');

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
].find((p) => existsSync(p));

if (!EDGE) {
  console.log('SKIP 未找到 Edge/Chrome');
  process.exit(0);
}

const steps = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['0', '0.35', '0.7', 'old:0.35'];

mkdirSync(OUT, { recursive: true });

for (const raw of steps) {
  const [mode, p] = raw.includes(':') ? raw.split(':') : ['new', raw];
  const profile = join(
    process.env.TEMP || '.',
    `edge-kumone-frame-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const name = (mode === 'old' ? 'old-' : '') + `swipe-${String(Math.round(Number(p) * 100)).padStart(2, '0')}.png`;
  const file = join(OUT, name);
  const res = spawnSync(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    '--virtual-time-budget=14000',
    `--user-data-dir=${profile}`,
    '--window-size=430,880',
    `--screenshot=${file}`,
    `${BASE}/test/fixtures/probe-swipe-frame.html?p=${p}&mode=${mode}`
  ], { encoding: 'utf8', timeout: 120000 });

  try { if (existsSync(profile)) rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch {}

  console.log(`${raw} → ${existsSync(file) ? 'OK ' + file : 'FAIL'}` + (res.error ? ' :: ' + res.error.message : ''));
}
