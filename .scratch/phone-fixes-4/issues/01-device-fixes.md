# 01 · 真机四个缺陷的修复（封面 / 状态栏 / 转场白块 / 后台播放）

Status: done
Feature: phone-fixes-4

## Problem

用户真机反馈：

1. 迷你播放条没有专辑封面。
2. 状态栏白条与顶部融在一起，图标看不见。
3. 左滑切页面冒出白色方块。
4. 后台不续播、偶发不能后台播。

## Root Cause

见 `../spec.md` 的「Root Causes」表 —— 每条都有可复现的探针，不是猜的。

## Implementation

### 1. 迷你条封面（`www/mobile/core/shell.js`）

```js
function coverOfTrack(track) {
  if (!track) return null;
  return track.cover || (track.album && track.album.picUrl) || null;
}
```

`setMini()` 改用它。归一化后的曲目（`album.picUrl`）与播放状态快照（`cover`）两种形状都认。

### 2. 状态栏（`android/.../MainActivity.java`）

- 窗口背景改成画布色 `0xFFF4F4F6`（与 CSS `--canvas` 一致）；API 31+ 才改（更早的启动图是窗口背景，改了就没启动画面）。
- 状态栏图标切深色：API 30+ 用 `WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS`，更早用 `SYSTEM_UI_FLAG_LIGHT_STATUS_BAR`。

### 3. 转场白块（`www/mobile/core/router.js` + `core/gesture.js` + `views/*.js` + `css/shell.css`）

**第一轮只修对了一半**：当时认定根因是「详情页被销毁 → 返回时退回骨架屏」，于是做了「详情页缓存还原 + 骨架屏改成灰色」。真机反馈**「还是没有解决」**。

**第二轮用真机录屏逐帧取证**（OpenCV 抽帧，1440×3200 / 61fps），定位到 **t≈1.70s 那一帧**：主页正在**重新加载**（4 个占位块还没出图），而旧的播放页还在旁边 —— **转场给用户看的是「半成品页面」**。

一共**四条**机制在制造白方块：

| # | 机制 | 修法 |
| --- | --- | --- |
| ① | **整页做透明度动画**：转场与左滑拖动时页面一边滑一边变淡，里面那些**白卡片**变成半透明的「白色方块」在灰底上飘（**最像用户说的那个**） | **只跟位移，不跟透明度**：`slideFollow` / `slideOutRight` / 转场进入全部去掉 opacity 动画 |
| ② | **白色卡片里的封面是个空白洞**：封面没加载出来时 `<img>` 是 `opacity:0`，白色卡片从中透出来 = 一块白 | 封面底色改成**灰的**（新增令牌 `--cover-blank`），不再靠 opacity 淡入 |
| ③ | **转场时露出的底**：`#m-main` 与「上一层」容器没有底色，露出来可能是白 | 都补上画布色 `#f4f4f6` |
| ④ | **转场给用户看「半成品页面」**：目标页在动画开始时还没就绪（骨架屏 + 没加载出来的封面块） | 见下 |

**④ 的修法（核心）**：

- 目标页**在动画开始前就绪**：
  - 有缓存 → **同步还原**（不等下一帧）；
  - 没缓存（第一次进）→ **动画立刻起**，内容在动画里就地长出来。
    **不要等数据** —— 等下去点下去就是「卡一下才动」，那才叫突兀。
- 可缓存的视图扩到 **主页 / 广播 / 搜索 / 我的**（除了有订阅的播放页与有轮询的登录页）。
- 缓存页面还原后调 `__refresh` 钩子**后台静默刷新**（先显示旧内容，数据到了就地更新）—— 首页不会一整天不更新。
- 左滑手势改成原生手感：**拖动时底下就是上一页**（上一页已缓存在容器里）。
- 骨架屏改成灰色渐变 + **虚线描边**（一眼看出是占位，不是内容）。

**⑤ 再后来的「过渡很突兀」**（第三轮返工）：用 CDP（`Emulation.setEmulatedMedia` 关掉 reduce-motion + 连拍）把转场中间帧拍下来看，发现三个问题：

| 问题 | 修法 |
| --- | --- |
| 上一轮加的「等内容就绪」最坏等 600ms → 点下去先卡一下 | **去掉等待**，动画立刻起 |
| 位移只有 26px → 像「啪」一下跳变 | 位移加大到 **进 38% / 出 14%**，旧页带**视差** |
| **新页面是透明的** → 旧页面的字从它的字缝里透出来，两页文字撞在一起 | 转场期间新页面是**一块不透明的整屏面板**（`background: var(--canvas)` + 满高），左滑手势期间同样处理 |
| 系统开了「移除动画」时是硬切（最突兀的一种） | reduce-motion 改成**短交叉淡入**（.18s），不做位移 |

另外把详情页的占位从「2×2 方块网格」换成**跟真实内容同形**的 `ui.skeletonDetail()`（头图 + 若干行）—— 那一屏大白方块正是用户第一次截图里的东西。

回归测试：`test/back-restore-view.mjs`（拖动时整页不许变透明 / 底下那一页有内容）、新增 `test/transition-ready-view.mjs`（真机录屏场景：主页 → 播放页 → 返回必须是完整主页，且不重新拉数据）。视觉验收工具：`.scratch/shoot-transition.mjs`（CDP 放慢动画连拍中间帧）。

### 4. 后台播放（`android/.../PlaybackService.java` + `MediaPlugin.java` + `www/mobile/core/player.js`）
- 新增前台服务：`foregroundServiceType=mediaPlayback`，持有框架 `MediaSession`，通知栏带上一首/播放暂停/下一首。
- 权限：`FOREGROUND_SERVICE`、`FOREGROUND_SERVICE_MEDIA_PLAYBACK`、`POST_NOTIFICATIONS`、`WAKE_LOCK`。
- JS 侧：安卓不再用 `navigator.mediaSession`（原生接管，否则两条媒体通知）；浏览器里补上 `playbackState` 与 `setPositionState`。
- 播放状态变化时通过 `KumoneMedia.publish()` 推给原生；系统媒体键与通知栏按钮回程走 `bridge.eval` → `Mobile.player.*`。
- 「一首放完 → 下一首」失败时重试 3 次（`advanceAfterEnd`）。

### 5. 搜索页的 `[object HTMLButtonElement]`（`www/mobile/views/search.js` + `core/ui.js`）

真机实拍：搜索页输入框下方出现一行「[object HTMLButtonElement]」，本该在那儿的「大家都在搜」chip 反而不见了。

**根因**：热搜 chip 是**元素**，却被当成第三个参数塞进 `ui.el('div', {...}, chip)`；`ui.el` 的第三个参数走 `innerHTML`，元素于是被**字符串化**，真正的 chip 根本没进 DOM。

**修法两处**：

1. 调用点：建行 → `row.appendChild(chip)` → `suggestBox.appendChild(row)`。
2. **`ui.el` 加固**：第三个参数是元素/片段（`nodeType` 1 / 11）时走 `appendChild`，不再走 `innerHTML`。这类错以后不会再以任何形式冒出来。

全仓扫过：其余 `ui.el` 第三参都是字符串，只有这一处是元素。回归断言加在 `test/fm-search-view.mjs`（「页面上没有 `[object` 字符串」「热搜 chip 真的渲染出来了」「chip 里有词」），并验证过它**能红**（临时撤掉加固 → 断言失败）。

### 6. 手机号 + 密码登不进去（`www/kumone/lib/api.js`）

用户报：账号与密码都没问题，但密码登录进不去。

**取证**：`.scratch/probe-login.js` —— 用内核打**真实**接口（假账号），稳定返回 `code=502 账号或密码错误` → 接口活着；调用链（界面 → 服务层 → 桥 → 内核 → weapi）逐段核对无误。

**发现的一处真问题**：内核**先发明文**再试 MD5 —— 而网易云服务端比的是 **MD5**（上游 NeteaseCloudMusicApi 就是发 MD5 的）。那一次明文注定失败，等于**先提交了一次错误密码**，有可能把账号推进风控（要验证码），结果正确密码也登不进去。

**修法**：先发 MD5，不行再退到明文；补上 `countrycode: '86'`。

**仍需用户确认**：失败时页面上显示的服务端 code 与文案是什么（要一张截图）—— 若不是 502 而是风控码（要验证码），那就不是编码问题，得另走验证码流程。

### 7. 右上角头像一点就掉登录态（`www/mobile/core/shell.js` + `views/login.js`）

用户要求：**歌单/我的归左上角，右上角只用来登录**。

- 右上角胶囊 → 打开**登录页**（不再直接退出登录）。
- 登录页在已登录时显示「已登录：昵称」+ **退出登录** / **切换账号** 两个按钮；退出登录仍带确认框。
- 回归断言加在 `test/library-view.mjs` 与 `test/mine-entry-view.mjs`。

## Acceptance

- `npm run test:mini:cover` —— 绿。
- `npm run test:back:restore` —— 绿。
- `npm run test:player` —— 第 14 节全绿。
- `npm run build:android` —— BUILD SUCCESSFUL，产物 4.26MB。
- **真机**：状态栏配色、后台续播、通知栏按钮 —— 待用户验证。

## Notes

- 前台服务启动失败（Android 12+ 后台起前台被拒）不会崩：捕获异常后只记一笔，播放本身不受影响。
- 通知栏封面是后台小线程拉的，拉不到就算了（不影响播放）。
