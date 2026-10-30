// 回归测试：广播页与搜索页（ticket 15）。
//
//   node test/fm-search-view.mjs
//
// 探针在 test/fixtures/probe-fm-search.html：它把 Mobile.service 换成假服务，
// 然后逐个场景断言：
//   1. 广播页出内容，「下一首」「不喜欢这首」两个动作都在且能驱动
//   2. 搜索页能被**模型**驱动：快照找输入框 → act(ref,'fill') 写字
//      → 点「搜索」→ 出结果
//   3. 动作白名单仍然是硬的：白名单外 → KUMONE_UNSUPPORTED；
//      对不可填写的元素 fill 也 → KUMONE_UNSUPPORTED
//
// 退出码：0 通过；1 不通过。

import { probe } from './browser.mjs';

await probe('test/fixtures/probe-fm-search.html', {
  label: '广播与搜索自检',
  budget: 14000
});
