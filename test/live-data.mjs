// 回归测试：真实网易云数据链路（浏览器里跑通「服务层 → 内核 → 官方接口」）。
//
//   node test/live-data.mjs
//
// 与 test/live.js 的区别：那个在 Node 里直连内核，这个在**浏览器**里
// 走完整链路（页面 → 移动端服务层 → 内核门面 → 加密请求 → 网易云 → 解码）。
//
// 桌面浏览器有 CORS，所以这条链路靠**本地 CORS 中继**（127.0.0.1:8111）
// 解开 —— 中继由本脚本按需拉起；内核层零改动，只是换了个 fetch 出口。
//
// 退出码：0 通过；1 不通过。

import { runProbe, ensureRelay } from './browser.mjs';

const relay = await ensureRelay();
const r = await runProbe('test/fixtures/probe-live-data.html', {
  budget: 20000,
  timeout: 120000
});
if (relay) relay.kill();

if (r.verdict === 'SKIP') {
  console.log(`SKIP  真实数据链路自检：${r.message}`);
  process.exit(0);
}
console.log(`${r.verdict === 'PASS' ? 'OK  ' : 'FAIL'}  真实数据链路自检：${r.message}`);
process.exit(r.verdict === 'PASS' ? 0 : 1);
