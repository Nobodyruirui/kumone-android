# 04: 转场动画顺滑

**What to build:** 左滑切换界面**跟手、不掉帧**，新页面立刻出现并自己开始加载，长列表滚动不卡。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 转场用 GPU 合成（`translate3d` + `will-change`），动画期间不被 DOM 构建阻塞
- [ ] 动画先起、新内容下一帧填入，第一帧不白
- [ ] 曲目行用 `content-visibility` 降低长列表渲染成本
- [ ] 歌词逐帧刷新只在歌词视图可见时计算
- [ ] 探针断言转场后新视图内容确实渲染出来了

## Comments

已完成（2026-10-31）。改动：转场改用 `translate3d` + `will-change`（GPU 合成）；**动画先起、内容下一帧再填**，外壳（标题 / 返回键 / 导航高亮）改为立刻同步；曲目行加 `content-visibility: auto`；歌词逐帧计算只在歌词视图可见时跑。
**顺带修掉一个真 bug**：调试发现 `requestAnimationFrame` 在无头 WebView 里**不触发**（setTimeout 正常）—— 也就是说「构建新内容」若只押在 rAF 上，切后台时导航会永远空白。现已改成 rAF + 定时器双保险（`nextFrame`）。
证据：全部探针（主页 / 资料库 / 播放页 / 登录 / 返回手势 / 歌单详情 / 模型流）重跑全绿。
真机项：验收清单 3.35 / 3.36。
