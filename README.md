# Kumone for Android

网易云音乐客户端 Kumone 的 **Android 版**。

基于原版（missuo/kumone）的 Windows/Electron 移植版二次适配而成：把网易云登录、接口加密（weapi/eapi）、扫码登录、全部前端界面完整迁移到 Android。通过 **Capacitor** 封装为原生 App，可在手机 App 里扫码登录、同步网易云数据、搜索、播放、管理歌单云盘。

> 技术细节：登录走网易云官方扫码流程（非账号密码），加密为标准的 weapi/eapi 算法，数据始终以网易云服务器为准（每个页面实时请求官方接口）。请合理使用，勿用于侵犯版权等用途。

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
├── www/                     # Web 层（前端 + 内核，即最终的 APP 界面）
│   ├── index.html           # 入口（引入内核 + 桥 + 前端）
│   ├── app.js               # 复用自原版 renderer，仅做了极少量安卓适配（confirm 等）
│   ├── style.css            # 原版样式
│   ├── style-mobile.css     # 新增：手机窄屏适配
│   ├── kumone/
│   │   ├── bridge.js        # 用「window.kumone」替代 Electron preload/IPC
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
├── capacitor.config.json    # Capacitor 配置
├── .github/workflows/build-android.yml  # 云端自动出 APK
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

## 内核自测

| 脚本 | 作用 |
|---|---|
| `npx esbuild ... bundle:qrcode` | 重新生成 qrcode 浏览器单文件 |
| `node test/verify-crypto.js` | 校验本版 weapi/eapi 密文与原版 **完全一致** |
| `node test/cors-probe.js` | 探测网易云是否返回 CORS 头（结论：不返回，故需原生桥） |
| `node test/live.js` | 用本内核真实调用 6 个匿名网易云接口，验证请求/加密/解码全链路 |

```bash
node test/verify-crypto.js   # 期望 ALL MATCH
node test/live.js            # 期望 6/6 endpoints OK
```

---

## 已知限制 & 提示

- **登录态有效期**：沿用网易云 `MUSIC_U` cookie，长期不活跃可能过期；过期时会提示重新扫码登录。
- **音源解锁**：依赖第三方公开接口，可能随时失效或受网络影响；可在设置里关闭。
- **仅供学习 / 个人使用**：请遵守网易云服务条款与版权法规。

## 技术说明：它是怎么登录 / 同步的？

- **登录**：调用官方 `/login/qrcode/unikey` 拿 `unikey` → 前端生成二维码 → 轮询 `/login/qrcode/client/login`，成功即拿到 `MUSIC_U` 等 cookie 存入本地。
- **加密**：`crypto.js` 实现 weapi（AES-128-CBC 两轮 + RSA 预计算密钥）与 eapi（AES-128-ECB + MD5），与原版算法逐字节一致。
- **同步**：登录后调用 `userAccount / userPlaylists / likedTrackIDs / playRecords / cloudSongs` 等官方接口，把数据实时拉下来展示；数据以服务器为准，本地仅作 UI 缓存。