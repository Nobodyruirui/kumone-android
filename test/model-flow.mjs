// 回归测试：模型序列（ticket 11 的模型侧验收项）。
//
//   node test/model-flow.mjs
//
// 只用模型能用的两把工具 —— Mobile.snapshot() 与 Mobile.act(ref, action) ——
// 走完一条真实流程：
//   快照 → 找到「资料库」→ 点它 → 快照 → 找到「喜欢的音乐」→ 点它
//       → 快照 → 找到那首歌 → 点它 → 确认真的开始播放
//
// 不许用内部 API 抄近道，也不许硬编码 ref —— 每次都从快照里按 role+name 现找。
//
// 退出码：0 通过；1 不通过。

import { probe } from './browser.mjs';

await probe('test/fixtures/probe-model-flow.html', {
  label: '模型序列自检',
  budget: 14000
});
