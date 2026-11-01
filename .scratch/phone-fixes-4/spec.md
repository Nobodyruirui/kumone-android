# 第四轮：真机反馈修复（封面 / 状态栏 / 转场白块 / 后台播放 / 导航）

Status: in-progress
Feature: phone-fixes-4

## Problem Statement

用户拿真机 APK 跑了一轮，报了 6 个问题：

1. **播放框仍没有专辑封面**（迷你播放条左边永远是音符占位图）。
2. **状态栏是白色的，跟最顶上融在一起**；状态栏图标是白底白字，等于看不见。
3. **左滑切换界面动画有问题**，会冒出莫名的白色方块。
4. **找不到歌单和收藏在哪**（资料库 → 播放列表 / 收藏的专辑，埋得太深）。
5. **资料库不要放在一级菜单**，一直点错；挪到左上角，用完一次即可。
6. **放到后台，一曲结束后不继续播**，有时候甚至不能后台播放。

## Root Causes（都拿到了证据，不是猜的）

| # | 根因 | 证据 |
|---|---|---|
| 1 | 归一化后的曲目封面在 `album.picUrl`，**没有** `cover` 字段；外壳 `setMini()` 只读 `track.cover` → 永远 null | 探针 `test/mini-cover-view.mjs` 先红后绿 |
| 2 | Capacitor 给 WebView 加了系统栏边距 → 状态栏那条露出的是**窗口背景**（启动图是白的）；启动主题图标是浅色 | 真机截图（白底白图标） |
| 3 | 详情页离开即销毁，返回时重新拉数据 → 先退回骨架屏；而骨架屏是 `--surface`（纯白）→ 白方块 | 探针 `test/back-restore-view.mjs`：返回后 60ms 内有 8 个骨架节点、0 首曲目、多打一次请求 |
| 6 | 没有前台服务（进程会被回收）＋ JS 从不设 `mediaSession.playbackState`（系统不认它在播）＋ 后台限流掐掉取址请求 | 代码审计 + 原生层缺失 |

## Solution

1. **封面**：外壳加 `coverOfTrack()`，`track.cover` 与 `album.picUrl` 两种形状都认。
2. **状态栏**：`MainActivity` 里窗口背景改成画布色 `#f4f4f6`，状态栏图标切深色（`APPEARANCE_LIGHT_STATUS_BARS`）。
3. **转场白块**：详情页声明 `cacheable: true` → 离开后停放进缓存容器（保持 connected）→ 返回时**直接还原**；骨架屏改成灰色渐变扫光。
4. **导航**：一级菜单去掉资料库；「我的」移到顶栏（方案待用户拍板，见 issues/02）。
5. **后台播放**：新增原生 `PlaybackService`（前台服务 + 框架 `MediaSession`，零新依赖）；JS 补 `playbackState` / `setPositionState`；「放完 → 下一首」失败重试 3 次。

## Implementation Decisions

- **前台服务用框架自带的 `MediaSession`**（`android.media.session`），不引 androidx.media 等新依赖 —— Gradle 依赖会牵出下载与版本问题。
- **安卓上原生接管媒体会话**，浏览器里仍用 `navigator.mediaSession`：两边同时用会出现两条媒体通知。
- **只让「无生命周期副作用」的视图进缓存**：播放页有订阅、扫码页有轮询，还原时不会重新接线，页面会僵住 —— 那比闪一下骨架屏更糟。所以缓存是**视图自己声明**（`cacheable: true`），不是全局开关。
- **停放的页面保持 connected**：请求回来还能回填、图片还能继续加载，回来时是「已经加载好的那一页」。
- **系统媒体键 / 通知栏按钮回程走 `bridge.eval`**：只有两参版本，不引入新桥接机制。

## Testing Decisions

- 复现优先：每个缺陷先写一个**能红**的探针，再改代码。
  - `test/mini-cover-view.mjs` —— 走真实链路（排队 → 引擎 emit → 外壳刷图）。
  - `test/back-restore-view.mjs` —— 返回后 60ms 内无骨架屏、且不重复取数。
  - `test/player.test.mjs` 新增第 14 节 —— 原生桥发布、媒体会话状态、放完自动切歌、续播失败重试。
- 骨架屏的断言是「底色与渐变里都没有纯白」，不是「不等于某个色值」。

## Out of Scope

- 不做真正的原生音频引擎（ExoPlayer / Media3）—— 那是把播放从 WebView 搬到原生的大工程。
- 不做离线缓存、下载、歌词下载。
- 不做歌单排序 / 批量移动 / 删除歌单。

## Further Notes

- 真机验收仍需用户侧确认（状态栏配色、后台续播、通知栏按钮）。
- 方案对比图：`.scratch/nav-mockups/compare.png`（A/B/C 三套导航）。
