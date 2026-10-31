# 04: 顶栏不被状态栏盖住

**What to build:** 用户在真机上打开任意页面，顶栏的返回箭头**完整可见、可点**，不再被手机的状态栏（通知栏）压住。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Android 15+ 的强制边到边下，WebView 拿到系统栏边距，界面内容整体落在状态栏与导航栏之间
- [ ] 低版本 Android 的行为不变（不出现多余空白）
- [ ] 顶部安全区留白在 WebView 里恒为 0 的情况下依然成立
- [ ] 出包后可在真机确认（记为待真机验证）

## Comments

已完成代码侧（2026-10-31），**待真机验证**。根因：targetSdk 35 + Android 15 强制 edge-to-edge，而 Capacitor 默认 `adjustMarginsForEdgeToEdge = "disable"`（WebView 直接顶到屏幕顶）；Android WebView 里 `env(safe-area-inset-top)` 恒为 0，所以 CSS 的安全区留白等于没写。
改法：`capacitor.config.json` 里设 `"adjustMarginsForEdgeToEdge": "auto"` —— Android 15+ 自动给 WebView 加系统栏边距（状态栏与导航栏），低版本系统行为不变（不用 `force`，避免旧系统多出一截空白）。
真机项：验收清单 3.26。
