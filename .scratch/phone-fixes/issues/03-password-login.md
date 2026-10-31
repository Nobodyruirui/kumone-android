# 03: 账号能登录

**What to build:** 用户在登录页默认看到**手机号 + 密码**表单，填完点登录就能进；密码错了能看到明确原因（而不是「登录失败」）；想扫码时切到另一个 Tab 即可。登录成功后回到被打断的地方。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 登录页是「账号登录 / 扫码登录」两个 Tab，默认落在账号登录
- [ ] 手机号 + 密码能真的登进去（接口走网易云手机号登录通道，成功后 Cookie 并入内核 cookie jar）
- [ ] 密码**不落盘**：不写 localStorage、不写日志、不出现在错误消息里
- [ ] 密码错误时给出明确结论（账号或密码错误），而不是笼统失败
- [ ] 扫码那条路原样保留，只降为备选 Tab
- [ ] 登录成功后刷新账号区并回到被打断的页面
- [ ] 服务层与登录页各有一条 Node 单测 / 视图探针断言

## Comments

已完成（2026-10-31）。取证：网易云的 `/login/email` 与 `/login/password` 已 404 下线，**只有 `/login/cellphone`（手机号 + 密码）还活着**（假账号返回 502「账号或密码错误」）。
内核新增手机号登录通道：先试明文密码，收到 502 再试一次 MD5 —— 服务端对密码的认法会变，**编码方式不出内核**；成功后 Cookie 并入内核 cookie jar。
服务层新增账号登录方法（新增错误码 `KUMONE_LOGIN_FAILED`，permanent）；登录页改成「账号登录 / 扫码登录」双 Tab，默认账号登录，扫码那套状态机原样保留只降为备选。密码只在这一次请求里出现：不落 localStorage、不写日志、不进错误消息（探针里专门断言了 localStorage 里搜不到密码）。
证据：`npm run test:service` 新增 11 条断言全绿；`npm run test:login:view`（Edge headless）全绿。
真机项：用真账号登录一次（验收清单 3.21 / 3.22）。
