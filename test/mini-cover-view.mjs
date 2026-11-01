// 回归测试：迷你播放条的专辑封面（真机报「播放框仍没有专辑封面」）。
//
//   node test/mini-cover-view.mjs
//
// 探针在 test/fixtures/probe-mini-cover.html。
// 退出码：0 通过；1 不通过。

import { probe } from './browser.mjs';

await probe('test/fixtures/probe-mini-cover.html', {
  label: '迷你条封面自检',
  budget: 12000
});
