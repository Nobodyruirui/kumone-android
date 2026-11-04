// 回归测试：「收藏」一级功能（独立于「登录 → 再进歌单收藏」那条流程）。
//
//   node test/favorites-view.mjs
//
// 探针在 test/fixtures/probe-favorites.html：把 Mobile.service 换成假服务，
// 断言未登录/已登录两种状态下的入口、页面内容与请求行为。
//
// 退出码：0 通过；1 不通过。

import { probe } from './browser.mjs';

await probe('test/fixtures/probe-favorites.html', {
  label: '「收藏」一级功能自检',
  budget: 16000
});
