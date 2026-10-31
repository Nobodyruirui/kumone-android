// 回归测试：返回手势与转场（.scratch/phone-fixes/issues/05-swipe-back-transition）。
//
//   node test/back-gesture-view.mjs
//
// 探针在 test/fixtures/probe-back.html：用合成触摸事件驱动边缘左滑。
// 断言：
//   1. 前进时旧内容被搬进「上一层」容器（转场真的发生，不是硬切）
//   2. 从左边缘右滑 → 回到上一页
//   3. 滑得不够 → 弹回原位
//   4. 顶栏返回箭头仍然能返回
//   5. 没有返回历史时边缘手势不启用
//
// 退出码：0 通过；1 不通过。

import { probe } from './browser.mjs';

await probe('test/fixtures/probe-back.html', {
  label: '返回手势自检',
  budget: 16000
});
