# Kumone for Android（移动端渲染层 · ego 风格）

网易云音乐第三方客户端的安卓版，基于 Capacitor 封装上游网页内核。个人学习用途。

## Agent skills

### Issue tracker

Issue 与 spec 以 markdown 文件存放在 `.scratch/`（本地文件追踪）。见 `docs/agents/issue-tracker.md`。

### Triage labels

默认五个角色标签：`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`。见 `docs/agents/triage-labels.md`。

### Domain docs

单 context 布局：仓库根目录 `CONTEXT.md` + `docs/adr/`。见 `docs/agents/domain.md`。

## 设计基线（先读这一段）

界面是**双模态**的：人读像素，模型读语义。同一份 DOM 另有一层投影 —— 一棵带稳定 ref 的语义文本树。

- 设计理论出处：`docs/ego-lite-UI设计理论.md`（摘要与出处）
- 落地决策：`docs/adr/0003-双模态界面与ego视觉语言.md`

十条准则（改代码前对照）：

1. **界面按消费者分层** —— 人看界面，模型看 `Mobile.snapshot()` 的文本树。不要用一套 UI 伺候两种读者。
2. **界面用语义，不用像素** —— 无障碍树就是契约；禁止裸 CSS 选择器与硬编码坐标做定位。
3. **观察是只读的** —— `snapshot()` 不改变任何状态：不动播放、不发请求、不改焦点。
4. **状态可查询，转移可命名** —— `player.state()` 可查；`play/pause/seek/next/queue` 各司其职。
5. **错误按"下一步该干什么"分类** —— `transient`（可重试）/ `permanent`（须换策略）。
6. **错误码是契约，措辞是实现** —— `KUMONE_*` 按码分支，不按文案分支。
7. **上下文预算是构建期纪律** —— 体积上限写进 `test/guard-design.mjs`，超限即失败。
8. **知识分层披露** —— 网易云页面的稳定定位器沉淀在 `www/mobile/learnings/`。
9. **教学顺序按失败概率排** —— 先教怎么跑起来、怎么登录，再教概念。
10. **约束前移成构建错误** —— 违反约定的写法在自测里失败，不靠代码评审发现。

### 视觉语言：ego 风格

白底画布、1px 描边、大圆角卡片、克制单色系、少量**角色色**（策展=橙 / 我的=黄 / 自动=蓝 / 工具=粉 / 中性=灰）、粗体主字配细斜体副标。

**颜色即角色**：一个颜色只承载一种含义，不做装饰。品牌红 `#fa2d48` 已停用（那是 Apple Music 的语言）。当前项用重墨 + 强描边，不用颜色。

### 导航（一级菜单只有三键）

底部只有 **主页 / 广播 / 搜索**。「我的」**不在一级菜单** —— 用户报过「一直点错」。

「我的」在顶栏左上角，一个**常驻**的小圆按钮（列表图标），点开是底部抽屉：

| 位置 | 是什么 |
| --- | --- |
| 顶栏左上角 | 常驻「我的」图标 → 「我的」抽屉（进二级页时让位给返回箭头） |
| 顶栏右上角 | 账号胶囊（头像 + 昵称 + VIP）→ 退出登录（带确认框）；**未登录时是「登录」按钮** |

顶栏左边是一个**固定 32px 的槽位**，返回箭头与「我的」图标**叠在里面二选一**：

- 两个按钮不能各占一格 —— 看不见的那个若还占位置，会把「我的」顶到离屏幕边缘约 52px（用户说「不符合人类审美」）。
- 槽位固定宽度，标题才能**相对屏幕真正居中**（`#m-title` 绝对定位 + `translateX(-50%)`）；跟着剩余空间居中会明显偏左。

右上角**只用来登录**：点它进登录页；已登录时登录页显示「已登录：昵称」+ **退出登录** / **切换账号**。点头像直接掉登录态太容易误触。

抽屉里：我的歌单 / 收藏的专辑 / 喜欢的音乐 / 云盘 / 最近播放 / 听歌排行 / 退出登录。抽屉与「我的」页面（`M.views.library`）**共用同一份入口集合**（`M.mine.buildEntries`）—— 同一个入口集合写两遍，迟早出现两个真相。

### 转场：目标页必须先就绪，且必须是「一层压住另一层」

**转场动画不能给用户看「半成品页面」。** 真机录屏里那批白方块就是这么来的：返回主页时主页正在重新加载，骨架屏 + 没加载出来的封面块叠在还没走完的播放页上。

规则：

- 有缓存的页面（视图声明 `cacheable: true`）→ **同步还原**，不等下一帧；
- 没有缓存的页面（第一次进）→ **动画立刻起**，内容在动画里就地长出来（占位 → 真内容）。
  **不要等数据**：等下去点下去就是「卡一下才动」，那才叫突兀；
- 转场与左滑**只跟位移，不跟透明度** —— 整页淡出时白卡片会变成半透明的「白方块」在灰底上飘；
- **新页面在转场期间是一块不透明的整屏面板**（`background: var(--canvas)` + 满高），
  旧页面带**视差**往反方向挪 14%。不这么做的话，新页面是透明的，
  旧页面的字会从它的字缝里透出来 —— 两页文字撞在一起，看着特别怪；
- 位移要**够大**（进 38% / 出 14%）：26px 的微移看着像「啪」一下跳变；
- 缓存页面还原后调 `__refresh` 钩子**后台静默刷新**（先显示旧内容，数据到了就地更新）。

可缓存的视图：详情页（歌单 / 歌手 / 专辑）、主页、广播、搜索、我的。**不可缓存**：播放页（有订阅）、登录页（有轮询）。

**占位形状要跟真实内容一样**：详情页以前用通用的方块网格（2×2），而详情页根本没有网格布局 —— 那一屏大白方块看着就像界面坏了。现在用 `ui.skeletonDetail()`（头图 + 若干行）。

## 项目分层

| 层 | 位置 | 约定 |
| --- | --- | --- |
| 内核层 | `www/kumone/lib/{crypto,client,api,unblock}.js` | weapi/eapi 加密、请求传输、API 封装、音源解锁。**除非修 bug，否则不要改** |
| 原生桥 | `android/app/src/main/java/com/kumone/music/HTTPClientPlugin.java` | 绕 CORS 的原生 HTTP 插件 |
| 上游原版渲染层 | `www/app.js` + `www/style.css` + `www/style-mobile.css` | 桌面取向的移植产物，**保留但不加载**，作为对照与回退基准 |
| 移动端渲染层 | `www/mobile/` | 本项目主战场。`core/`（契约、外壳、路由、快照、歌词解析、手势）、`views/`（各页面）、`css/`（令牌与样式）、`fonts/`、`learnings/`（知识包） |
| 参考与待接线 | `www/mobile/reference/`、`www/mobile/features/lyrics/` | 旧皮肤层脚本与桌面主题样式（仅作对照）；上游桌面版的逐字歌词模块（仅作对照，移动端自己的歌词实现在 `www/mobile/core/lyrics.js`） |

登录走网易云官方流程：默认**手机号 + 密码**（内核 `/login/cellphone`，密码的编码方式由内核自己试），**扫码登录**是备选 Tab。Cookie 存 `localStorage`（`MUSIC_U`）；密码只在一次请求里出现，不落盘。

## 移动端渲染层的公开接口

| 接口 | 作用 |
| --- | --- |
| `Mobile.snapshot(opts?)` | 当前界面的语义文本树。`opts.scope='subtree'` + `opts.root='@N'` 取子树 |
| `Mobile.act(ref, action, args?)` | 对 ref 执行动作。白名单：`click` / `scroll` / `focus` / `fill` |
| `Mobile.nav/back/goTab(view)` | 导航栈（与上游语义一致）。`back` 带转场动画；`back({skipGhost:true})` 用于手势接管的场景 |
| `Mobile.slidePrepare()` / `slideFollow(dx)` / `slideBack()` / `slideOutRight(cb)` | 边缘左滑手势的四步。**只跟位移，不跟透明度** —— 整页淡出时白卡片会变成半透明的「白方块」 |
| `Mobile.views[type]` | 视图注册表，值形如 `{ title, render(view) }`；加 `cacheable: true` 表示该视图离开后可被**停放进缓存**、返回时直接还原（只能给没有订阅 / 没有轮询的视图用） |
| `Mobile.shell.toast(msg)` / `setMini(track)` / `setMiniProgress(ratio)` | 外壳操作（`setMini` 认 `track.cover` 与 `track.album.picUrl` 两种封面形状） |
| `Mobile.errors.make(code, parts)` / `fromKernel(err, ctx)` / `retryable(err)` | 错误契约 |
| `Mobile.lyrics.build({lrc,tlyric,yrc})` / `parseLrc` / `parseYrc` / `activeIndex(lines,t)` | 歌词解析（纯函数，逐字优先） |
| `Mobile.service.loginByPassword(phone, pwd)` | 手机号 + 密码登录；密码不落盘 |
| `Mobile.service.playlistDetail(id)` | 歌单 / 榜单详情（曲目在 `playlist.tracks`，顶层没有） |
| `Mobile.service.songDetails(ids)` | 按 id 批量取曲目（「加载更多」用） |
| `Mobile.service.createPlaylist(name)` / `addToPlaylist(pid, ids)` | 建歌单 / 加歌单 |
| `Mobile.service.subscribeAlbum(id, on)` / `likedAlbums()` | 收藏专辑 / 收藏的专辑列表 |
| `Mobile.actions.addToPlaylist(track)` / `newPlaylist(onDone)` | 打开「加入歌单」抽屉 / 新建歌单 |
| `Mobile.actions.openMine()` | 打开「我的」：未登录 → 拉起扫码；已登录 → 底部抽屉（我的歌单 / 收藏的专辑 / … / 退出登录） |
| `Mobile.ui.sheet({title})` | 底部抽屉（加入歌单、新建歌单、「我的」用；不切页面） |
| `Mobile.gesture.attach()` / `detach()` | 边缘左滑返回手势 |
| `Mobile.systemBack()` | 系统返回键：有历史就返回上一页，没有就退出 App |
| `window.kumone.invoke(channel, args)` | 内核门面（网易云能力入口） |

**新增或修改任何公开接口，必须同时更新四处**：`接口定义 → 实现 → 回归测试 → 文档（AGENTS.md / 对应需求文档）`。

## 构建与自测

```bash
npm install
npm run web                 # http://localhost:8100 看界面（浏览器直连网易云会被 CORS 拦，属正常）
npm test                    # 加密基线自测：期望 ALL MATCH
npm run test:live           # 真实接口联通：期望 6/6 endpoints OK
npm run test:guard          # 设计约束闸：体积 / 临时 ref / 错误码 / 语义契约
npm run test:learnings      # 知识包校验：禁临时 ref、工具必须可执行
npm run test:lyrics         # 歌词解析纯函数（整行 / 逐字 / 翻译）
npm run test:login:view     # 登录页双 Tab 自检（Edge headless）
npm run test:detail:view    # 歌单/榜单详情自检（Edge headless）
npm run test:mine:view      # 我的歌单/收藏专辑/播放模式自检（Edge headless）
npm run test:back:view      # 边缘左滑返回与转场自检（Edge headless）
npm run test:back:restore   # 返回时还原上一页、不退回骨架屏（Edge headless）
npm run test:mini:cover     # 迷你播放条的真实封面（Edge headless）
npm run build:android       # 需本机 Android 环境
```

给手机装 APK：推送版本 tag → GitHub Actions 云端构建 → 从 Releases 下载安装（仓库需公开）。

> `test/verify-crypto.js` 默认与仓库内的加密基线比对；若要跟原始 Node 内核逐字节对照，把路径放进环境变量 `KUMONE_ORIGINAL_KERNEL`。基线更新必须显式执行 `node test/verify-crypto.js --update`。

## 安卓原生层

| 文件 | 作用 |
| --- | --- |
| `HTTPClientPlugin.java` | 绕 CORS 的原生 HTTP 插件（内核门面走它） |
| `BackPlugin.java` | 退出 App |
| `MediaPlugin.java` | 播放状态的原生出口（`KumoneMedia.publish()`）；系统媒体键 / 通知栏按钮回程走 `bridge.eval` |
| `PlaybackService.java` | **前台服务**（`foregroundServiceType=mediaPlayback`）+ 框架自带 `MediaSession`：后台播放保活、锁屏与通知栏控制。零新依赖 |

界面层在安卓上**不用** `navigator.mediaSession`（原生已接管，否则会出现两条媒体通知）；浏览器里才用。

## 约定与坑

- **只有 `www/` 会被打进 APK**（`capacitor.config.json` 的 `webDir: "www"`）。仓库根目录只放构建产物之外的元信息（文档、脚本、`.scratch/`），**不要再在根目录放界面文件**。
- 入口页面是 `www/index.html`，它加载**移动端渲染层**，**不加载**上游原版渲染层 `www/app.js`。二者并存但不同时运行（见 ADR-0001）。
- 移动端渲染层不引用上游原版渲染层的全局（`state`/`player`/`audio` 都是上游的 `const`，不挂 `window`）。移动层自持状态与播放引擎，通过 `window.kumone.invoke(channel, args)` 这个内核门面调用网易云能力。
- 移动层视图用 `Mobile.views` 注册，键为视图类型；`Mobile.nav/back/goTab` 管理导航栈。
- 支持 `#home` / `#library` / `#fm` 这类 hash 深链直接进入某个页面（预览与调试用）。
- **不要在界面层硬编码颜色/字号/圆角** —— 全部走 `www/mobile/css/tokens.css` 的令牌。
- **创建的 button 必须带 `aria-label`**（`test/guard-design.mjs` 会拦）。
- **知识包与模型动作层不得使用临时 ref**（`@12`、`ref=12`），只用稳定 locator。
- 改内核后先跑 `npm test` 与 `npm run test:live` 再提交。
- 界面预览图：`.scratch/apple-music-ui/shoot-preview.ps1`（手机尺寸 390×844 两屏 + 模型语义树并排）。
