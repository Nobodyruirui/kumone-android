// 回归测试：歌单 / 榜单详情（.scratch/phone-fixes-2/issues/01-playlist-tracks）。
//
//   node test/detail-view.mjs
//
// 探针在 test/fixtures/probe-detail.html：假服务模拟网易云 v6 接口的真实形状
// （曲目在 playlist.tracks，顶层没有 tracks —— 真机上报「榜单点进去是空的」）。
// 断言：
//   1. 详情页能拿到曲目，首屏 50 首
//   2. 有「加载更多」，点了能追加且不清空
//   3. 封面走缩略图 + https + 懒加载 + 异步解码
//
// 退出码：0 通过；1 不通过。

import { probe } from './browser.mjs';

await probe('test/fixtures/probe-detail.html', {
  label: '歌单详情自检',
  budget: 14000
});
