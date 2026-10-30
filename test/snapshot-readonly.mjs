// 回归测试：Mobile.snapshot() 观察是只读的。
//
//   node test/snapshot-readonly.mjs
//
// 探针在 test/fixtures/probe-readonly.html：连续取三次快照，
// 断言 DOM 未被改动、界面状态未变、同一元素的 ref 稳定。
//
// 退出码：0 通过；1 不通过。

import { probe } from './browser.mjs';

await probe('test/fixtures/probe-readonly.html', {
  label: 'snapshot 只读自检',
  budget: 12000
});
