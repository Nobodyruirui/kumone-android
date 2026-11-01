// 用 CDP 把转场放慢后连拍中间帧 —— 唯一能"用眼睛验收过渡"的办法。
//   node .scratch/shoot-transition.mjs [outDir]
//
// 关键点：
//   1. Emulation.setEmulatedMedia 把 prefers-reduced-motion 改成 no-preference
//      （无头 Chrome 默认是 reduce → 应用的转场会被整段跳过，拍不到中间帧）
//   2. Animation.setPlaybackRate 把动画放慢 10 倍 → 截图时还在半路上
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO = process.cwd();
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const OUT = process.argv[2] || join(REPO, '.scratch', 'shots');
mkdirSync(OUT, { recursive: true });

const profile = join(process.env.TEMP || '.', 'edge-cdp-' + Date.now());
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profile,
  '--window-size=400,900',
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  const res = await fetch('http://127.0.0.1:' + PORT + '/json/list');
  return res.json();
}

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await targets();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (_) { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('连不上 Edge 的调试端口');
}

const wsUrl = await connect();
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
};
function send(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r && r.result ? r.result.value : undefined;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name), Buffer.from(r.data, 'base64'));
  console.log('  →', name);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Animation.enable');
// 关键：把「减少动态效果」关掉，否则应用的转场被整段跳过
await send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
});
// 动画放慢 10 倍 → 截图时还在半路
await send('Animation.setPlaybackRate', { playbackRate: 0.1 });

const url = 'http://127.0.0.1:8123/.scratch/transition-freeze.html?dir=' + (process.argv[3] || 'forward');
await send('Page.navigate', { url });
await sleep(2500);

const reduced = await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches");
console.log('reduced-motion =', reduced);

// 触发一次转场，然后连拍（动画被放慢 10 倍 → 每张都在半路上）
// 触发一次转场，然后**连拍**（转场只有 300ms，得连着拍才抓得到中间）
const t0 = Date.now();
const fired = await evaluate("!!(window.__fire && window.__fire())");
console.log('fired =', fired);
for (let i = 1; i <= 8; i++) {
  await shot('tr' + i + '.png');
  console.log('   t=' + (Date.now() - t0) + 'ms');
}

console.log('截图目录：', OUT);
ws.close();
edge.kill();
process.exit(0);
