# Kumone for Android

网易云音乐客户端 Kumone 的 **Android 版**。

基于原版（missuo/kumone）的 Windows/Electron 移植版二次适配而成：把网易云登录、接口加密（weapi/eapi）、扫码登录、全部前端界面完整迁移到 Android。通过 **Capacitor** 封装为原生 App，可在手机 App 里扫码登录、同步网易云数据、搜索、播放、管理歌单云盘。

> 技术细节：登录走网易云官方扫码流程（非账号密码），加密为标准的 weapi/eapi 算法，数据始终以网易云服务器为准（每个页面实时请求官方接口）。请合理使用，勿用于侵犯版权等用途。

## 当前进度：界面正在重做

本仓库正在把界面从"桌面版移植"改造成 **ego-lite 风格的手机端**（白底画布、1px 描边卡片、粗体主字 + 细斜体副标、角色色块）。做法是新增一套独立的**移动端渲染层**（`www/mobile/`），内核层（加密、请求、接口封装、音源解锁）完全不动；上游原版渲染层保留在仓库中但不加载，作为对照与回退基准。

界面是**双模态**的：同一份 DOM 既给人读像素，也给模型读语义。

| 模态 | 入口 | 说明 |
|---|---|---|
| 人读像素 | 屏幕 | ego 视觉语言：白底 + 黑描边 + 角色色，无毛玻璃、无品牌红 |
| 模型读语义 | `Mobile.snapshot()` | 输出带稳定 ref 的无障碍文本树（`role "name" [ref=@N, current]`），观察是**只读**的 |
| 模型动手 | `Mobile.act(ref, action)` | 动作白名单 click / scroll / focus / fill；过期 ref → `KUMONE_STALE_REF`，未知动作 → `KUMONE_UNSUPPORTED` |

- 需求与设计决策：`CONTEXT.md`（术语）、`docs/adr/`（架构决策，其中 `0003` 是 ego + 双模态基线）
- 视觉理论出处：`docs/ego-lite-UI设计理论.md`
- 验收相关：`docs/验收清单.md`（真机逐条勾）、`docs/已知问题.md`（未通过项都记在这，不悄悄跳过）
- 规格与任务：`.scratch/apple-music-ui/`（spec + 带阻塞关系的 ticket）
- 现状：外壳（底部导航 / 吸顶大标题 / 迷你播放条）、设计令牌、语义快照与动作层、错误契约、知识包、**主页五区块（真实数据）**、**歌单 / 歌手 / 专辑详情页**、**扫码登录闭环**、**资料库（五入口 + 账号区）**、**全屏播放页（封面 / 进度 / 音质 / 音量 / 队列）**、**广播（私人 FM）与搜索**均已就位；真机验收仍在推进中

---

## 功能

- **扫码登录 / 登出**：用网易云音乐 App 扫码即登录，Cookie 本地持久化；登录后自动加载你的用户数据
- **用户数据同步**：我的歌单、喜欢的音乐、听歌排行（本周/所有）、云盘音乐
- **发现页**：个性化推荐歌单、精品歌单、排行榜、推荐歌手、新碟上架、每日推荐 / 最新音乐
- **搜索**：单曲 / 专辑 / 歌手 / 歌单，含搜索联想与默认词
- **歌单**：详情、播放、心动模式、收藏 / 取消、新建 / 删除、增删歌曲（支持大歌单分页）
- **专辑 / 歌手**：详情、播放、收藏、关注、相似艺人、专辑列表
- **私人 FM**：播放、不喜欢、自动续播
- **云盘音乐**：列表、容量、播放、删除
- **播放能力**：队列、下一首播放、顺序 / 列表 / 单曲循环、音质（标准→Hi-Res）自动降级、相似歌曲、离线听歌词（LRC+中文+罗马音）、点击歌词跳转
- **音源解锁（可选）**：无版权 / VIP 试听时尝试第三方音源（酷我 / 酷狗 / pyncmd）
- **移动端优化**：窄屏布局、播放条唤醒、禁用缩放
- **设置**：外观主题、音源解锁开关、检查更新、版本信息

---

## 目录结构

```
kumone-android/
├── www/                     # 唯一的构建产物目录（Capacitor webDir）
│   ├── index.html           # 入口（移动端渲染层）
│   ├── app.js               # 上游原版渲染层（桌面取向）—— 保留但不加载
│   ├── style.css            # 上游原版样式 —— 保留但不加载
│   ├── style-mobile.css     # 上游原版的窄屏适配 —— 保留但不加载
│   ├── mobile/              # 移动端渲染层（ego-lite 风格）
│   │   ├── app.js           # 入口：装配外壳 → 路由 → 视图
│   │   ├── core/shell.js    # 外壳：吸顶栏 / 底部导航 / 迷你播放条
│   │   ├── core/router.js   # 导航栈与视图注册
│   │   ├── core/errors.js   # 错误契约：14 个稳定错误码 + 五要素消息
│   │   ├── core/service.js  # 服务层：视图与内核之间的唯一边界（归一化 + 错误翻译 + 登录中断）
│   │   ├── core/player.js   # 播放引擎：队列 / 下一首 / 播放模式 / 音质降级 / MediaSession / 持久化
│   │   ├── core/snapshot.js # 模型可读界面：语义文本树 + 稳定 ref + 动作白名单
│   │   ├── core/ui.js       # 界面零件：区块 / 骨架 / 错误卡 / 登录引导 / 封面卡 / 曲目行
│   │   ├── core/actions.js  # 跨视图动作：打开歌单/歌手/专辑、扫码登录、播放
│   │   ├── core/login.js    # 扫码登录状态机：获取 → 等待 → 确认 → 成功 / 过期 / 失败
│   │   ├── views/           # 各页面（主页 / 详情 / 登录 / 资料库 / 占位页…）
│   │   ├── learnings/       # 知识包：稳定定位器（role+name，禁临时 ref）
│   │   ├── css/tokens.css   # 设计令牌（颜色、字号、圆角、动效）
│   │   ├── css/shell.css    # 外壳样式
│   │   ├── fonts/           # Inter 拉丁子集（正体 + 斜体）
│   │   ├── reference/       # 旧皮肤层脚本与桌面主题样式（仅作对照，不加载）
│   │   └── features/lyrics/ # 逐字歌词模块（下一轮 feature 的起点，暂不加载）
│   ├── shared/              # 渲染层共享区（上游原版与移动端都能引用的纯函数）
│   │   └── normalize.js     # 共享归一化纯函数（v3/旧版字段都吃，浏览器 + Node 双载）
│   ├── kumone/              # 内核层（不要动）
│   │   ├── bridge.js        # 内核门面：把 Electron 的 IPC 换成页面内调用
│   │   └── lib/
│   │       ├── crypto.js    # 网易云 weapi/eapi 加密（浏览器版，Node 亦可用以测试）
│   │       ├── client.js    # 传输层：cookie + 请求（安卓走原生 HTTP 桥，浏览器走 fetch）
│   │       ├── api.js       # 全部网易云 API（typed）——与主进程 CHANNELS 一一对应
│   │       └── unblock.js   # 第三方音源解锁
│   └── vendor/              # crypto-js、qrcode 的浏览器单文件
├── android/                 # Capacitor 生成的 Android 原生工程
│   └── app/src/main/java/com/kumone/music/
│       ├── MainActivity.java        # 注册原生 HTTP 桥
│       └── HTTPClientPlugin.java    # 原生 HTTP 桥（绕 CORS）
├── capacitor.config.json    # Capacitor 配置（webDir = www）
├── .github/workflows/build-android.yml  # 云端自动出 APK
├── CONTEXT.md               # 术语表
├── docs/adr/                # 架构决策记录
└── test/                    # 内核验证脚本（见下）
```

### 与 Windows 版的核心差异

| 原版（Electron） | 本版（Android） |
|---|---|
| `main.js` + `preload.js`，渲染进程经 IPC 调网易云 | 移除 IPC，改 `kumone/bridge.js` 在页面内直接调浏览器内核 |
| 后端用 Node `crypto` / `http` 发请求（无 CORS） | 加密用 `crypto-js`（浏览器版）；请求走**原生 HTTP 插件** `HTTPClientPlugin` 绕 CORS |
| 登录态存 `userData/cookies.json` | 存 `localStorage` |
| 系统媒体键 IPC | `navigator.mediaSession` |
| `window.confirm/prompt` 依赖 | 改为自定义异步确认框 |

---

## 快速体验（Web 版，可选）

按静态页面方式在浏览器跑一跑。**注意**：浏览器页面调网易云接口会被浏览器的 CORS 策略拦截而报错，这是正常现象；真正安装到安卓 App 后，请求改走原生桥、不受影响。此步主要用于界面与前端联调的观察。

```bash
npm install
npm run web     # 打开 http://localhost:8100
```
> 如需在浏览器里真实打通网易云接口，可搭配一个能加 `Access-Control-Allow-Origin` 的本地代理；但**安卓 App 不需要**，原生桥已解决。

### 试用台（推荐先玩这个）

```bash
npm run try
```

会起一个本地服务并打开 **http://127.0.0.1:8100/tools/try.html**：

- **左边**：App 真机尺寸（390×844）的真实界面 —— 现在**主页已经接上真实数据**（每日推荐 / 推荐歌单 / 排行榜 / 推荐歌手 / 新碟上架），可以直接点歌单进详情；
- **右边**：三组可以亲手点的按钮 ——
  - *模型可读界面*：读语义树 `snapshot()`、用 `act(ref)` 点导航、用过期 ref / 未知动作看契约错误；
  - *知识包工具*：`listPlaylists()` / `currentPlayback()` / `togglePlayback()`（role+name 定位，不用记 ref）；
  - *真实网易云数据*：每日推荐、排行榜、账号状态（走「服务层 → 内核 → 官方接口」真实请求）。

> 桌面浏览器直接请求网易云会被 CORS 拦，所以试用台会起一个**本地 CORS 中继**（127.0.0.1:8111），并把页面里的 `fetch` 出口改道到它 —— **内核层零改动**，只是换了个门。Edge / Chrome / ego-lite 都能用，不需要 `--disable-web-security`。
>
> 未登录时只有匿名接口可用，「我的歌单 / 喜欢的音乐 / 云盘」要等扫码登录（`www/mobile/views/login.js`，内核三件套已接好）。

---

## 手机直接下载安装（推荐，本机零安卓环境）

利用 GitHub Actions 在云端自动装 SDK 并打 APK，再发布成**公开 GitHub Release**，手机浏览器直接打开就能下载安装，全程你的电脑不用装 Android Studio / SDK。

1. **建一个公开的 GitHub 仓库**，然后把本工程推上去。仓库必须**公开**，手机才能免登录直接下载：

   ```bash
   cd F:\test\kumone-android
   git remote add origin https://github.com/<你的用户名>/kumone-android.git
   git push -u origin main
   ```

2. **打一个版本标签**——这一步会触发云端构建，并把 APK 自动发布成 Release：

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

3. 等几分钟（Actions 跑完后），手机浏览器打开下面的 Releases 页，点 **`kumone-v1.0.0.apk`** 下载安装（Android 允许未知来源即可）：

   ```
   https://github.com/<你的用户名>/kumone-android/releases
   ```

   也可以直接用下载直链（打开即下）：
   ```
   https://github.com/<你的用户名>/kumone-android/releases/download/v1.0.0/kumone-v1.0.0.apk
   ```

> APK 由 Android 自带的 debug keystore 自动签名，可直接安装。功能确认满意后，如需正式发布给他人，再配置签名 keystore（属可选项）。

---

## 本地构建（可选，需要 Android 环境）

```bash
npm install
npx cap sync android                 # 把 www 同步进 android 工程
cd android
./gradlew assembleDebug              # 输出 app/build/outputs/apk/debug/app-debug.apk
```
或用 Android Studio 打开 `android/` 目录，选 `app` 运行到模拟器 / 真机。

---

## 自测

| 脚本 | 作用 |
|---|---|
| `npm test` | 校验本版 weapi/eapi 密文与**仓库内基线**一致（期望 ALL MATCH） |
| `npm run test:smoke` | 内核加载 / cookie jar / 解码冒烟（期望 SMOKE: ALL PASS） |
| `npm run test:live` | 用本内核真实调用 6 个匿名网易云接口，验证请求/加密/解码全链路 |
| `npm run test:guard` | 构建期约束：体积闸、禁临时 ref、错误码完整性、语义契约 |
| `npm run test:readonly` | 断言 `Mobile.snapshot()` 观察是只读的（不改 DOM、不改状态、ref 稳定） |
| `npm run test:model` | 以模型视角驱动界面：ref 点击生效 / 过期 ref / 未知动作 |
| `npm run test:learnings` | 知识包校验：定位器可调用、无临时 ref 残留 |
| `npm run test:learnings:browser` | 知识包在真实应用里可用（role+name 定位 + 契约错误） |
| `npm run test:normalize` | 共享归一化纯函数：v3/旧版字段、纯函数性、可播性判定链 |
| `npm run test:service` | 服务层：归一化 / 错误契约翻译 / 登录中断 / 分层纪律 |
| `npm run test:player` | 播放引擎：队列 / 插播 / 播放模式 / 音质降级 / 持久化 |
| `npm run test:login` | 扫码登录状态机：获取 / 推进 / 过期刷新 / 成功恢复 / 过期重扫 / 网络抖动 |
| `npm run test:home` | 主页：五区块状态机、骨架被替换、错误卡分区、登录引导、落点与语义 ref |
| `npm run test:library` | 资料库：未登录拉起扫码、五入口与 ref、二级列表、账号区与退出登录 |
| `npm run test:nowplaying` | 全屏播放页：全屏隐藏、进度 seek、播放控制、音量音质、队列、收起、空状态 |
| `npm run test:model-flow` | 模型序列：快照 → 进资料库 → 点喜欢的音乐 → 真的开始播放（只用 snapshot + act） |
| `npm run test:fm-search` | 广播与搜索的服务层：FM 归一化 / 不喜欢 / 四类搜索 / 联想 / 默认词 / 错误翻译 |
| `npm run test:fm-search:view` | 广播与搜索的界面：FM 两个动作、搜索能被模型 `fill` 驱动、白名单仍是硬的 |
| `npm run test:try` | 试用台按钮全部点得通（模型层 / 知识包 / 真实数据） |
| `npm run test:live:data` | 浏览器里走通「服务层 → 内核 → 网易云真实接口」 |
| `npm run test:guard:prove` | **反向自证**：往代码里注入违规写法，确认守卫会失败，然后自动还原 |
| `npm run test:actions:prove` | **反向自证**：让知识包声明的动作白名单与实现漂移，确认校验器会失败，然后自动还原 |
| `npm run fix:bom` | 去掉被 PowerShell 写入的 BOM（PS 5.1 的 `Set-Content -Encoding UTF8` 会加 BOM，JSON 会被它弄坏；`.ps1` 相反，必须带 BOM） |
| `npm run fix:ps1-bom` | 给 `.ps1` 加 UTF-8 BOM（PS 5.1 读无 BOM 的脚本会把中文当 GBK 解析 → 语法报错） |
| `npm run check:encoding` | 编码体检：`.json/.js/.md` 必须无 BOM，`.ps1` 必须有 BOM |
| `npx esbuild ... bundle:qrcode` | 重新生成 qrcode 浏览器单文件 |

```bash
npm test                    # 期望 ALL MATCH
npm run test:live           # 期望 6/6 endpoints OK
npm run test:smoke          # 期望 SMOKE: ALL PASS
npm run test:guard          # 期望 GUARD: PASS
npm run test:readonly       # 期望 PASS DOM 未变、状态未变、ref 稳定
npm run test:model          # 期望 PASS ref=@N 点击后进入资料库…
npm run test:learnings      # 期望 知识包校验通过
npm run test:learnings:browser # 期望 PASS
npm run test:normalize      # 期望 NORMALIZE: ALL PASS
npm run test:service        # 期望 SERVICE: ALL PASS
npm run test:player         # 期望 PLAYER: ALL PASS
npm run test:login          # 期望 LOGIN: ALL PASS
npm run test:home           # 期望 OK 主页自检：PASS
```

> 加密自测默认与仓库内基线比对。原始 Node 内核不在本仓库内，若要跟它逐字节对照，把路径放进环境变量 `KUMONE_ORIGINAL_KERNEL` 再运行。基线只能在明确需要时用 `node test/verify-crypto.js --update` 重建。

---

## 已知限制 & 提示

- **登录态有效期**：沿用网易云 `MUSIC_U` cookie，长期不活跃可能过期；过期时会提示重新扫码登录。
- **音源解锁**：依赖第三方公开接口，可能随时失效或受网络影响；可在设置里关闭。
- **仅供学习 / 个人使用**：请遵守网易云服务条款与版权法规。

## 技术说明：它是怎么登录 / 同步的？

- **登录**：调用官方 `/login/qrcode/unikey` 拿 `unikey` → 前端生成二维码 → 轮询 `/login/qrcode/client/login`，成功即拿到 `MUSIC_U` 等 cookie 存入本地。
- **加密**：`crypto.js` 实现 weapi（AES-128-CBC 两轮 + RSA 预计算密钥）与 eapi（AES-128-ECB + MD5），与原版算法逐字节一致。
- **同步**：登录后调用 `userAccount / userPlaylists / likedTrackIDs / playRecords / cloudSongs` 等官方接口，把数据实时拉下来展示；数据以服务器为准，本地仅作 UI 缓存。