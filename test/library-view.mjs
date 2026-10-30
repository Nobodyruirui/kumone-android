// 回归测试：资料库（ticket 10）。
//
//   node test/library-view.mjs
//
// 探针在 test/fixtures/probe-library.html：它把 Mobile.service 换成假服务，
// 然后逐个场景断言：
//   1. 未登录点「资料库」→ 直接进扫码页，不是五个点不动的入口
//   2. 已登录点「资料库」→ 五个入口都在，各自带 ref，摘要异步补上
//   3. 点「播放列表」→ 进我的歌单列表
//   4. 点「喜欢的音乐」→ 进曲目列表
//   5. 顶栏账号区 → 显示昵称；点它弹确认框；确认后调 logout 并回主页
//
// 退出码：0 通过；1 不通过。

import { probe } from './browser.mjs';

await probe('test/fixtures/probe-library.html', {
  label: '资料库自检',
  budget: 14000
});
