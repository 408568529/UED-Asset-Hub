# V2.5 依赖矩阵（首轮）

日期：2026-10-19。取自本轮本地源码、固定契约及 GenUI tgz；没有进行 Windows 构建或再分发许可审批。

| 项目 | 版本/身份 | 目标交付位置与阶段 | 当前状态/阻断 |
|---|---|---|---|
| Hub standalone / MCP / Proxy / Supervisor | 基线 de63f916；最终以 V2.5 Commit/Tree 为准 | app；Windows 构建产物，启动必需 | 当前无 V2.5 Windows 构建；不能用旧 f2e761fe ZIP 代替 |
| Node Windows x64 | Internal Release 候选22.23.2；记录哈希见下 | tools；计划随包，安装/启动必需 | 当前只是 artifact 契约，非已随包或本轮重新下载验证 |
| Node Service 通道 | Constructor 22.23.3/npm10.9.9 | 既有独立 Service/构建通道 | 与 Internal Release 的22.23.2/npm10.9.8不同；Supervisor Service 精确版本门禁不能直接复用到22.23.2；最终选择待验证 |
| Git Windows x64 | MinGit2.53.0.2，固定官方ZIP与哈希 | tools；计划隔离工具；首次和日常本地来源校验必需 | 已记录官方release与API digest；隔离下载与完整notice复核进行中 |
| DSH authority | dsh-v0.1.1-rc.2；b150a551b8d465e31e418e1b2eaf5e79bbb7d28e；Tree53915efe4e2126cc7779b73dfc8a3bcec5318c44 | 安装依赖目录的独立 Source，含必要 Git 历史 | Git bundle 可复用；不能把纯源码 tar 当 Git authority。尚未构建 V2.5 依赖包 |
| DSH Runtime | 同一 DSH Commit，完整 Windows x64 node_modules/原生构件/编译输出 | 独立依赖目录；维护者准备，用户启动使用 | 现安装脚本会 pnpm install/build；本轮没有证明无需目标用户编译，交付阻断 |
| pnpm / Corepack | pnpm11.7.0；Corepack版本待锁 | 维护者准备 DSH/GenUI 时需要；用户是否需要取决于最终初装设计 | 不能宣称已随包，也不要求用户搜索安装；签名/工具链/离线缓存待验 |
| GenUI 发布 tgz | dsh-plugin-genui0.15.1；SHA见下 | 随 app 提供；官方 Plugin Manager 安装 | 本轮重新计算哈希匹配；tgz非完整profile |
| GenUI profile / React / WASM | tgz依赖范围 React^18.3.1、esbuild-wasm^0.25.12等；完整安装锁未产出 | 新的隔离 web profile；计划 Windows 构建准备 | 必须产出实际版本/哈希和 native/链接闭包；不得从作者 Mac profile 复制 |
| GenUI补丁和受限preset | ued-visible-readiness-v2 / ued-haldur-reading-v1 | app 和目标profile；由既有安装流程应用 | 源码已在基线；本轮修复发行依赖分析误报；Windows实际应用待验证 |
| Windows helpers | x64 Job / pipe-security / DPAPI | app/native；维护者 MSVC 编译 | 普通用户不安装 VS；当前无本轮构件及DLL装载证据 |
| Knowledge / Haldur 数据与媒体 | 新用户自己的合法内容 | 外置持久数据树；初装仅合法空索引 | 不包含作者 DATA、会话和GenUI成果；原始分散目录沿用须另外预检 |
| PowerShell / Explorer / 浏览器 | 以目标Windows支持版本验收 | Windows系统前置 | 实际普通账户、脚本编码、中文文件名/空格路径和权限未验证 |
| npm / TypeScript / MSVC | npm10.9.8；TS为现有package-lock；MSVC实际版本随构建记录 | 维护者构建工具 | TypeScript仅用于构建时依赖AST分析，运行manifest校验延迟导入路径不需要TS；分析在prune前完成 |
| 许可清单 | DSH/GenUI元信息MIT，其他按实际构件 | licenses | 全部依赖仍需逐项核实notice和再分发要求，未完成 |

## 固定身份与哈希边界

- Node22.23.2 Windows x64 node.exe：`0d0f5e39f9f3d9587bc19f73eab3c2c9c4903fd02d6dbf9c853dd81b3d95fad4`，来源为当前已提交 `service/windows/node-22.23.2-x64.artifact.json`；这是exe的固定值，不能用于ZIP。官方SHASUMS本轮核对的ZIP哈希为`1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97`；分别验证archive和exe。
- GenUI tgz：`ac555017451724f6a4b990da8ac951603c8cfc8c61634b6015067f71c689689b`，本轮对仓库tgz实物重新计算匹配。tgz声明 Node兼容范围 `^22.19.0 || ^24.0.0`。现入口仅做22.19+检查，仍需后续收紧版本交集。
- DSH Source：Commit/Tree见表，sourceFingerprint `1e6c2e8009679997ee5de23d4976f6060bea53e6670a3e6b07f022251bf43584`。这不是 Windows Runtime 压缩包哈希，不能混称。
- Git、Corepack、完整GenUI依赖树、DSH Windows Runtime、helpers及最终ZIP的版本/哈希尚未产出；在这些位置保留缺失状态，不填造值。

## 获取方式与网络

默认不承诺离线。维护者准备官方GitHub锁定DSH和npm依赖，Node工具取自官方分发站。优先在授权Windows构建机完成会触发编译的准备并冻结结果；若原生包需要目标机VS或手工编译即 FAIL。若仍需用户首次联网，必须提供有版本/哈希/重试恢复的受控流程并新机实测；当前尚未形成此流程。

后续运行应只做本地来源、依赖与配置验证，不重新install/build。DeepSeek模型调用与原站图片等外部资源依然需要网络。各依赖当前实物哈希和来源证据记录在 dependency-evidence.json；源码文件哈希不能冒充构件哈希。

本轮官方MinGit2.53.0.2 ZIP SHA-256：`d4bf83d6a860ccae9af44e508e1e00a39f09db6fa78a9ba5543b94d87ca22a29`。来源：[Git for Windows固定发布页](https://github.com/git-for-windows/git/releases/tag/v2.53.0.windows.2)，与GitHub API asset digest一致；Node ZIP/exe已分别对照[官方SHASUMS](https://nodejs.org/dist/v22.23.2/SHASUMS256.txt)。
