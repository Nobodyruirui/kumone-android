// 回归测试：知识包在真实应用（浏览器）里能不能用。
//
//   node test/learnings-browser.mjs
//
// Node 侧的加载自检在 test/validate-learnings.mjs；这里测的是"接进应用之后"：
//   1. 入口按 manifest.loadOrder 加载 → KumoneLearnings.netease 四个工具都在
//   2. 定位走 role+name：空参数 → KUMONE_EMPTY_RESULT；未命中 → KUMONE_NOT_FOUND
//   3. 播放状态能读到（迷你播放条降级路径），播放开关能动作
//
// 退出码：0 通过；1 不通过。

import { probe } from './browser.mjs';

await probe('test/fixtures/probe-learnings.html', {
  label: '知识包浏览器自检',
  budget: 12000
});
