// 浏览器探针跑测的公共件。
//
//   import { runProbe } from './browser.mjs';
//
// 三个坑都在这里统一处理掉：
//
//   1. **必须用全新的 profile 目录**。复用同一个 --user-data-dir 时，
//      Edge 会拿缓存里的旧页面跑 —— 表现为「改了代码但测试结果没变」。
//      （这个坑真的踩过：改了探针页，浏览器还在跑旧的那份。）
//   2. **端口上已有服务就直接用**，没有才自己起一个 python http.server，
//      跑完把自己起的那个关掉。
//   3. **结果格式统一**：探针页把结论写进
//      `<pre id="result" data-result="PASS|FAIL">消息</pre>`，
//      这里负责解析并退出码。
//
// 退出码：0 通过；1 不通过；无浏览器时 0（SKIP）。

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const PORT = 8100;
const BASE = `http://127.0.0.1:${PORT}`;

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];

/** 找到可用的浏览器；找不到返回 null（调用方决定 SKIP 还是 FAIL）。 */
export function findBrowser() {
  return EDGE_CANDIDATES.find((p) => existsSync(p)) || null;
}

async function serverUp() {
  try {
    const r = await fetch(`${BASE}/test/fixtures/probe-actions.html`, {
      signal: AbortSignal.timeout(2000)
    });
    return r.ok;
  } catch { return false; }
}

/** 端口上没服务就临时起一个；返回要关掉的进程（没有则 null）。 */
async function ensureServer() {
  if (await serverUp()) return null;
  const proc = spawn('python', ['-m', 'http.server', String(PORT), '--directory', repo], {
    stdio: 'ignore'
  });
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (await serverUp()) return proc;
  }
  proc.kill();
  throw new Error(`起不来本地服务（${BASE}）`);
}

/**
 * 跑一个探针页。
 * @param {string} probePath 相对仓库根的探针路径，例如 'test/fixtures/probe-home.html'
 * @param {object} [opts] { label, budget, timeout }
 * @returns {object} { verdict: 'PASS'|'FAIL'|'SKIP', message }
 */
export async function runProbe(probePath, opts = {}) {
  const edge = findBrowser();
  if (!edge) {
    return { verdict: 'SKIP', message: '未找到 Edge/Chrome' };
  }

  const server = await ensureServer();
  // 每次用全新 profile：复用旧 profile 会让浏览器跑缓存里的旧页面
  const profile = join(
    process.env.TEMP || '.',
    `edge-kumone-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );

  const out = spawnSync(edge, [
    '--headless=new', '--disable-gpu', '--no-first-run',
    `--virtual-time-budget=${opts.budget || 12000}`,
    `--user-data-dir=${profile}`,
    '--dump-dom',
    `${BASE}/${probePath}`
  ], { encoding: 'utf8', timeout: opts.timeout || 90000 });

  if (server) server.kill();

  // 跑完就把临时 profile 删掉：每次跑测新建一个 profile，
  // 不清的话一次几百 MB、几十次就是几个 GB（实测堆到过 6 GB）。
  try {
    if (existsSync(profile)) rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  } catch { /* 删不掉就留给系统清理 %TEMP%，别让测试失败 */ }

  const dom = out.stdout || '';
  // 结果容器有两种：<pre id="result"> 与 <div id="result">，都认
  const m = dom.match(/id="result" data-result="([A-Z]+)"[^>]*>([\s\S]*?)<\/(?:pre|div)>/);
  if (!m) {
    const err = (out.stderr || '').split('\n').slice(0, 5).join('\n');
    return { verdict: 'FAIL', message: '探针没有产出结果（headless 输出为空或页面未执行）' + (err ? ' | ' + err : '') };
  }
  return { verdict: m[1], message: (m[2] || '').trim() };
}

/**
 * 确保本地 CORS 中继在跑（127.0.0.1:8111）。
 * 桌面浏览器直连网易云会被 CORS 拦 —— 中继是解法，比给浏览器加
 * --disable-web-security 干净（后者会绑死某一个浏览器）。
 * @returns {Promise<object|null>} 要关掉的进程（本来就是跑着的则返回 null）
 */
export async function ensureRelay() {
  const probeUrl = 'http://127.0.0.1:8111/proxy?url=' +
    encodeURIComponent('https://music.163.com/api/personalized?limit=1');
  try {
    const r = await fetch(probeUrl, { signal: AbortSignal.timeout(2500) });
    // 200 = 通；400 = 中继在但这个 url 不在允许列表（也算在跑）
    if (r.status === 200 || r.status === 400) return null;
  } catch { /* 没在跑，往下走 */ }

  const proc = spawn('node', [join(repo, 'tools', 'cors-proxy.mjs')], { stdio: 'ignore' });
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const r = await fetch(probeUrl, { signal: AbortSignal.timeout(2500) });
      if (r.status === 200 || r.status === 400) return proc;
    } catch { /* 还没起来 */ }
  }
  proc.kill();
  throw new Error('起不来本地 CORS 中继（127.0.0.1:8111）');
}

/** 跑探针并按结果打日志 + 设置退出码。 */
export async function probe(probePath, opts = {}) {
  const label = opts.label || probePath;
  const r = await runProbe(probePath, opts);
  if (r.verdict === 'SKIP') {
    console.log(`SKIP  ${label}：${r.message}`);
    process.exit(0);
  }
  console.log(`${r.verdict === 'PASS' ? 'OK  ' : 'FAIL'}  ${label}：${r.message}`);
  process.exit(r.verdict === 'PASS' ? 0 : 1);
}

export { BASE, PORT, repo };
