// 回归测试：主页（ticket 08）的状态机与语义契约。
//
//   node test/home-view.mjs
//
// 探针在 test/fixtures/probe-home.html：它把 Mobile.service 换成假服务，
// 注入固定返回，然后逐个场景断言：
//   1. 成功路径 —— 五个区块都出内容，快照里能读到区块标题与卡片 ref
//   2. 落点路径 —— 点歌单卡进详情，底部导航当前项仍是「主页」
//   3. 错误路径 —— 只有一个区块失败，只有它变成错误卡，且 transient 给「重试」
//   4. 未登录路径 —— 每日推荐显示登录引导，点它能进扫码页
//
// 退出码：0 通过；1 不通过。

import { probe } from './browser.mjs';

await probe('test/fixtures/probe-home.html', {
  label: '主页自检',
  budget: 14000
});
