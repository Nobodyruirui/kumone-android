// 回归测试：转场时不能给用户看「半成品页面」（真机录屏里的白方块）。
//
//   node test/transition-ready-view.mjs
//
// 探针在 test/fixtures/probe-transition-ready.html。
// 场景：主页 → 播放页 → 返回。主页应当被**直接还原**（不退回骨架屏、不重新拉数据），
//      还原之后再在后台刷新一次。
//
// 退出码：0 通过；1 不通过。

import { probe } from './browser.mjs';

await probe('test/fixtures/probe-transition-ready.html', {
  label: '转场就绪自检',
  budget: 22000
});
