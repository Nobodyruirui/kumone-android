// 回归测试：返回时还原上一页，而不是退回骨架屏（真机报「左滑出现白色方块」）。
//
//   node test/back-restore-view.mjs
//
// 探针在 test/fixtures/probe-back-restore.html。
// 退出码：0 通过；1 不通过。

import { probe } from './browser.mjs';

await probe('test/fixtures/probe-back-restore.html', {
  label: '返回还原自检',
  budget: 20000
});
