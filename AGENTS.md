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

## 项目分层

| 层 | 位置 | 约定 |
| --- | --- | --- |
| 内核层 | `www/kumone/lib/{crypto,client,api,unblock}.js` | weapi/eapi 加密、请求传输、API 封装、音源解锁。**除非修 bug，否则不要改** |
| 原生桥 | `android/app/src/main/java/com/kumone/music/HTTPClientPlugin.java` | 绕 CORS 的原生 HTTP 插件 |
| 上游原版渲染层 | `www/app.js` + `www/style.css` + `www/style-mobile.css` | 桌面取向的移植产物，**保留但不加载**，作为对照与回退基准 |
| 移动端渲染层 | `www/mobile/` | 本项目主战场。`core/`（契约、外壳、路由、快照）、`views/`（各页面）、`css/`（令牌与样式）、`fonts/`、`learnings/`（知识包） |
| 参考与待接线 | `www/mobile/reference/`、`www/mobile/features/lyrics/` | 旧皮肤层脚本与桌面主题样式（仅作对照）；逐字歌词模块（下一轮 feature 的起点，暂不加载） |

登录走网易云官方扫码流程，Cookie 存 `localStorage`（`MUSIC_U`）。

## 移动端渲染层的公开接口

| 接口 | 作用 |
| --- | --- |
| `Mobile.snapshot(opts?)` | 当前界面的语义文本树。`opts.scope='subtree'` + `opts.root='@N'` 取子树 |
| `Mobile.act(ref, action, args?)` | 对 ref 执行动作。白名单：`click` / `scroll` / `focus` / `fill` |
| `Mobile.nav/back/goTab(view)` | 导航栈（与上游语义一致） |
| `Mobile.views[type]` | 视图注册表，值形如 `{ title, render(view) }` |
| `Mobile.shell.toast(msg)` / `setMini(track)` / `setMiniProgress(ratio)` | 外壳操作 |
| `Mobile.errors.make(code, parts)` / `fromKernel(err, ctx)` / `retryable(err)` | 错误契约 |
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
npm run build:android       # 需本机 Android 环境
```

给手机装 APK：推送版本 tag → GitHub Actions 云端构建 → 从 Releases 下载安装（仓库需公开）。

> `test/verify-crypto.js` 默认与仓库内的加密基线比对；若要跟原始 Node 内核逐字节对照，把路径放进环境变量 `KUMONE_ORIGINAL_KERNEL`。基线更新必须显式执行 `node test/verify-crypto.js --update`。

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
