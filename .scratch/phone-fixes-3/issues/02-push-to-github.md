# 02: 推到 GitHub（不含个人信息）

**What to build:** 这三轮的成果进入用户指定的 GitHub 仓库，仓库里**不含任何个人信息**（邮箱、昵称、本机绝对路径、构建产物、本地配置）。

**Blocked by:** 01 歌词真的出得来 + 我的内容齐活

**Status:** ready-for-agent

- [ ] 扫一遍要提交的文件：邮箱 / 昵称 / 绝对路径 / `*.apk` / `local.properties` / `.gradle`
- [ ] 个人信息要么删掉、要么换成中性写法
- [ ] 构建产物与本地配置不进库
- [ ] 提交信息写清这一轮做了什么
- [ ] 推到 `Nobodyruirui/kumone-android` 的 `main`
- [ ] 推完核对远端确实更新了

## Comments

已完成（2026-10-31）。
**个人信息体检**（`git grep` 全量扫描已跟踪 + 新增文件）：邮箱、本机绝对路径、用户名、构建产物 —— 文件层面**干净**。两处处理：① 测试里的手机号改成明显的占位符 `138-0000-0000`；② 本轮提交的**署名用 noreply 邮箱**（`Nobodyruirui@users.noreply.github.com`），不让真实邮箱再进新历史。
**未入库**：`*.apk`（.gitignore 已含）、`android/local.properties`、`node_modules/`、`android/app/build/` —— 暂存清单逐项核对过。
**注意**：仓库**历史里早先的提交**仍然带真实邮箱（`1782586036@qq.com`），那是本次之前就推上去的。要彻底去掉需要重写历史（filter-repo / BFG），风险较高，需要时再单独做。
推送：`main` → `Nobodyruirui/kumone-android`，commit `47b6f44`，推送后核对本地与远端差异为 0/0。
