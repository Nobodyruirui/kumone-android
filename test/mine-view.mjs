// 回归测试：我的内容（.scratch/phone-fixes-3/issues/01-playlist-and-fav）。
//
//   node test/mine-view.mjs
//
// 探针在 test/fixtures/probe-mine.html：所有取数走假服务。
// 断言：
//   1. 播放页有「加入歌单」与「播放模式」按钮
//   2. 播放模式在 顺序 → 单曲循环 → 列表循环 → 随机 之间切换，并写进引擎
//   3. 「加入歌单」弹出底部抽屉，能选歌单、能新建
//   4. 歌单详情每一行都有「+」按钮
//   5. 资料库有「收藏的专辑」入口；我的歌单页有「新建歌单」
//   6. 专辑页有「收藏」按钮
//
// 退出码：0 通过；1 不通过。

import { probe } from './browser.mjs';

await probe('test/fixtures/probe-mine.html', {
  label: '我的内容自检',
  budget: 16000
});
