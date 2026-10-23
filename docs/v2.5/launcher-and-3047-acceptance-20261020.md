# V2.5 启动中心与 Mac 3047 受控更新验收（2026-10-20）

已在现有 `codex/v2.5-competition-delivery` 实施。起始 HEAD `27d184b2aff1c960e2dc8dfdc0942d0cc7daab3b`；启动中心提交 `09d13933258b34ed3c32ff6e36128d6699dc7589`；当前运行程序源码 `e28f055f85f67a51cecc353db8619a480dcfdf07`。没有新建分支/worktree、Push、合并或部署 Windows 正式服务。

Mac 3047 当前已使用独立 V2.5 程序目录 `/Users/zhouzhijun/Documents/UED Asset Hub Visual Refresh/runtime/versions/v25-e28f055f85f6`，Hub Build ID `fn58Rjf5iETbeTWDlOROW`。Hub 用固定 Node 22.23.2 在隔离工作区构建；Hub 源码、配置和 lock 在已通过烟测的 09d1393 到 e28f055 间完全相同，后者只增加 Mac 指针包装的检测/停止入口。程序文件摘要见 mac-demo-version.json；不覆盖原运行文件。

## 实际验收与边界

| 项目 | 状态 | 证据与范围 |
| --- | --- | --- |
| Hub 未启动时独立启动中心 | PASS | 两平台原生 API/协议；Mac 实际 Finder 双击，非 Hub 业务路由 |
| Ant / 原颜色 Token / 离线构件 | PASS | 实际 Ant Card/Steps/Form/Table；直接复用 KnowledgeThemeProvider，computed 品牌 #2ccc6c、主按钮 #141414；无 CDN |
| 控制通道边界 | PASS | 私有能力令牌、精确 Host、回环远端、Origin/CSRF、JSON、固定动作白名单、重复中心身份挑战；Windows 控制文件显式当前 SID ACL |
| 真正只读预检 | PASS | 构件 SHA、系统/CPU、固定 Node/Git、原权限/路径与端口；不初始化业务数据、不读模型 Key、不杀进程/改系统 PATH |
| 新目录确认、管理员、已有安装识别 | PASS | 两平台合成 API 测试；管理员密码校验在业务写入之前；已有目录不覆盖，识别后非敏感配置摘要不变 |
| Windows x64 完整启停与重复打开 | PASS | D 盘隔离安装；Hub/DSH/Gateway/Proxy 管理员门禁、重复 PID、鉴权停止、沿用原安装；native-windows.json |
| Windows 最终源码 / UI 修正后的预检 | PASS | protocol-windows-current.log、final-windows-preflight.json；无 Windows GUI 证据 |
| Mac arm64 原生完整启停 | PASS | native-mac.json；首次失败保留，复用原合成数据在原生上下文重验通过 |
| Mac 真实 GUI 双击与启动 | PASS | Finder 双击、真实按钮启动、实际服务 Ready，关闭网页后服务继续；gui-mac.json 与截图 |
| GUI 首次管理员录入 / Windows GUI | NOT_VERIFIED | 首次管理员仅经合成 API 验证，没有把脚本操作当作 GUI |
| 最新 Mac Hub 独立烟测 | PASS | latest-mac-isolated.json：独立 5747/5847 端口，完整栈、权限、知识库、Haldur 上传队列、HTML/SVG 下载/预览 |
| 默认本机对 LAN 不开放 | PASS | 3047/3048/3147/3148/3149 与中心绑定 127.0.0.1；授权 Windows 测试机对 Mac 局域网地址负向 TCP 验证全失败，无防火墙修改 |
| 局域网共享能力 | PARTIAL | 现有 HTTPS/Secure Cookie/Agent Proxy 机制保留；本轮安全配置定向测试通过，跨机 HTTPS 复用上一轮旧发行隔离证据。新向导明确待配置并拒绝直接共享；本轮未做新包 LAN GUI 验收 |
| Typecheck / Build / 安全配置 | PASS | typecheck-final.log、build.log、build-node22.log、host-security-config.log；最终协议回归通过 |
| 3047 旧进程归属与停止 | PASS | 原 Supervisor 14612 不存在；精确核对 UID、创建时间、cwd、执行文件、原锁与端口，仅 SIGTERM 25240/14721/14722/14737；均退出，无强杀 |
| 3047 独立版本与入口切换 | PASS | 私有 current-demo-version.json，固定版本目录；新版 01/02/03 指针检测/启动/停止，已实际停止并再启动 |
| 3047 知识库、Haldur、HTML/SVG | PASS | 当前实际浏览器知识库及只读 API；既有预览和沙箱 CSP 通过 |
| 3047 批量上传 | PARTIAL | 同一 Hub 构建的隔离数据已验证 Haldur 队列及并发上传；没有向原正式资产写验收文件，原数据上的 GUI 批量上传未做 |
| 3047 Knowledge MCP / Agent | PASS | 实际 MCP discovery/search、真实 SKILL.md 内容读取及 sha；原受限 Agent 会话列表/历史通过 Proxy；无 prompt 或模型调用 |
| 3047 既有 GenUI 成果 | PASS | 只读打开原 GenUI 会话后插件按受限 Preset 冷加载，原成果 HTTP/CSP 通过；冷启动未加载会话前 404 不能当成全局插件缺失 |
| 新模型调用 / 新 GenUI 生成保存 | NOT_VERIFIED | 本轮未调用模型、未创建成果，不用 Runtime ready 代替真实生成验收 |
| 数据与凭据保护 | PASS | Hub DATA 58、Haldur 187、媒体 3、会话 14、GenUI 86 个文件，最终摘要全部不变；保留审计仅核对原登录/凭据文件元数据；鉴权按既有方式读取原受保护登录配置。路径配置及旧入口摘要不变 |
| 旧程序回退依据 | PASS | 旧程序文件清单全部哈希复核一致，旧 Build ID `S35pMShHpg4r7OXFXAe1m`，原入口保留 |
| 真正执行旧版回退 | NOT_VERIFIED | 保留并验证回退依据，没有演练切回旧业务版本；新版本异常应优先受控停新、按文档切旧，不能初始化空数据 |
| 新干净 Windows / Mac 全程首启 | NOT_VERIFIED | NEW_MACHINE_NOT_VERIFIED；没有“解压即用”结论 |
| 新 ZIP | NOT_VERIFIED | 本轮没有重打 ZIP。原 Windows/Mac ZIP 已找回到原交付位置并核对原 SHA；它们不含新启动中心 |
| 资源清理与占用 | PARTIAL | 只删已确认本轮 helper 副本，实际观测释放 1015808 bytes；详见 RESOURCE-REPORT.md。保留被 profile 引用的解压目录；无连续绝对峰值数据 |

## 启动与使用

通用候选包 README 的「一、检测；二、配置；三、启动；四、使用/退出」已更新，见 `docs/v2.5/README.md` 和 README.html。关闭页面不会停止 Hub；“退出启动中心”只退出中心。Key 只在原 DSH 后台设置，不新增 DPAPI 或独立凭据 UI；原 DSH 明文文件+权限保护不能称为加密。

当前 Mac 3047 请使用 `/Users/zhouzhijun/Documents/UED Asset Hub Visual Refresh/runtime/02-轻点击我启动.command`。01 是只读检查，03 是鉴权受控停止。原 `启动3047演示.command` 与 `config/start-recovered-3047.sh` 保留作旧版依据；日常不再用旧入口替代新启动中心。

程序与数据分离：新程序在 `runtime/versions/v25-e28f055f85f6`，继续沿用原 `runtime/hub-data`、`Haldur-Design-Skill`、培训媒体、`agent-runtime/dsh-home` 和 GenUI；原配置路径不变。现有 Windows 正式服务 `UEDAssetHubR2C` PID 7448，正式 3080/3081/3082 PID 保持原值，未部署。

**已知基线差异：** 原工作区未提交「52原则」没有偷偷并入 V2.5。当前新版没有该路由，原成果完整保留在原工作区及旧回退程序中。此边界在本轮之前的 V2.5 README 已说明；不宣称该模块已随当前新版交付。

## 版本与回退

旧程序 `/Users/zhouzhijun/Documents/UED Asset Hub Visual Refresh/runtime/recovery-validation/workspace`，旧 Build ID `S35pMShHpg4r7OXFXAe1m`，文件身份保存在 3047-old-program-identity.json。旧文档中的 `KrD0...` 是更早快照，未用它冒充本次回退身份。原 3047 公共端口切换前未监听，但四个内侧旧子进程仍存在；已核实再受控停止，未重复拉起。

若新版异常：先执行新 03，确认本实例与关联端口已释放；将私有指针的 `kind` 改为 `legacy-recovery`、`programRoot` 改回上述已保留旧目录，再执行新 02（它将调用原恢复脚本）。指针必须保留当前账户独占权限，不能从网页写任意路径。具体指针模板与说明位于 `runtime/V2.5-启动与回退.md`。原数据、管理员、模型配置不回滚、不重置，未知端口归属先停止操作。

## 失败与修复记录

- 实际浏览器发现主题组件 JSX 经典运行时造成白屏，修正离线 esbuild 为 automatic JSX；修复后在浏览器确认 Ant 结构与 Token 计算值。
- Windows 控制文件初始所有权识别失败，改为只在新建空状态文件上显式设置当前 SID 所有者及私有 ACL，未降低校验。最后协议/原生启停通过。
- Mac 第一次受限执行上下文的 DSH 首启失败，stderr 当时未捕获，不能断言具体原因；受限上下文对存活检查也曾返回 EPERM。原生上下文同一合成安装通过复验。一次单独诊断漏设 DSH_HOME，落到默认 profile，不能用那份诊断替代原失败原因；日志保留，无真实模型调用。
- 最新独立目录组装两次暴露 MCP SDK 与嵌套 AJV 的依赖缺口，按实际已锁安装树补齐嵌套依赖，再通过完整烟测。没有删验证/临时在线安装来掩盖缺失。
- 收尾 Windows 脚本一次漏设 D 盘 TEMP、一次临时 helper 错用 Windows ESM 路径，修正测试包装后最终通过；发行根和业务数据仍在 D 盘；未调整系统权限/系统 PATH，未放宽发行安全边界。
- GUI 测试停止轮询一次 ECONNRESET，只读重试确认服务和端口已停止，再退出中心；未重复初始化或强杀。

## ZIP 与源码

原包目录 `/Users/zhouzhijun/Documents/UED Asset Hub/roadshow-output/v2.5-delivery-20261019-01a15349/final`。两 ZIP 本轮中途不在该目录，未推断是谁移动/删除；从已存在构建副本恢复并验证，详见两个 old-zip-restored.json。没有重新打 ZIP，也未把新 UI overlay 当作正式新包。

- Windows 原包 885797825 bytes；SHA-256 `dfb4a259069f46c3bce28aa99bd4e1104b4d4c1679402f0b57539505b68a7732`。
- Mac 原包 891929626 bytes；SHA-256 `93d43411ba99930ce8b8575a68a54164987ec89ae2965daba34d30ed3c9aac0c`。

实现改动文件：

- `delivery/competition/02-轻点击我启动.cmd`
- `delivery/competition/02-轻点击我启动.command`
- `delivery/competition/center/center.css`
- `delivery/competition/center/center.js`
- `delivery/competition/center/center.js.LEGAL.txt`
- `delivery/competition/center/manifest.json`
- `docs/v2.5/README.html`
- `docs/v2.5/README.md`
- `package.json`
- `scripts/build-competition-center-ui.mjs`
- `scripts/build-competition-delivery.mjs`
- `scripts/competition-center-layout.css`
- `scripts/competition-center-private.ps1`
- `scripts/competition-center-ui.tsx`
- `scripts/competition-center.html`
- `scripts/competition-center.mjs`
- `scripts/competition-check.mjs`
- `scripts/competition-choose-folder.ps1`
- `scripts/competition-launcher.mjs`
- `scripts/mac-demo-center.mjs`
- `scripts/start-current-mac-demo.py`
- `scripts/verify-competition-center.mjs`

## 证据

完整证据目录：`/Users/zhouzhijun/Documents/UED Asset Hub/roadshow-output/v2.5-launcher-20261020/reports`。主要 JSON：native-windows.json、native-mac.json、gui-mac.json、latest-mac-isolated.json、3047-post-update-acceptance.json、3047-retention-after.json、3047-old-program-identity.json、3047-pointer-activation.json、mac-loopback-negative.json。当前状态覆盖旧报告的“3047 未监听”；旧发行验收材料保留其原时间边界。

![新版启动中心](</Users/zhouzhijun/Documents/UED Asset Hub/roadshow-output/v2.5-launcher-20261020/reports/3047-launcher-ready.png>)

![3047 知识库](</Users/zhouzhijun/Documents/UED Asset Hub/roadshow-output/v2.5-launcher-20261020/reports/3047-knowledge-restored.png>)
