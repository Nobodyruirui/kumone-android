# 01: 歌单与榜单详情真的有内容

**What to build:** 用户点进任何一个榜单（或任何歌单）都能看到曲目，并且能一路加载更多。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 歌单 / 榜单详情能取到曲目（网易云 v6 接口的曲目在 `playlist.tracks`，不在顶层）
- [ ] 服务层同时透出完整曲目 id 列表，供「加载更多」用
- [ ] 详情页首屏显示 50 首，下面有「加载更多」，点了能追加
- [ ] 加载更多失败时给明确错误提示，不清空已显示的曲目
- [ ] 服务层与详情页各有一条断言（Node 单测 + Edge 探针）

## Comments

已完成（2026-10-31）。取证：`.scratch/probe-playlist-detail.js` —— v6 接口返回 `{code, playlist:{tracks,trackIds,trackCount}, privileges}`，**顶层没有 tracks/songs**，移动端从顶层取 → 0 首（榜单与所有歌单详情都是空的）。
实现：服务层改从 `playlist.tracks` 取并透出 `trackIds`/`total`；新增 `service.songDetails(ids)` 供分页用；详情页首屏 50 首 + 「加载更多」（失败给重试，不清空已显示）。
证据：`npm run test:service` 新增 7 条断言全绿；`npm run test:detail:view`（新探针）11 条断言全绿。
真机项：验收清单 3.30 / 3.31。
