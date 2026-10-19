# V2.5 实施计划与首轮基线

日期：2026-10-19。阶段：隔离基线与技术收口；实现未完成，未产出 Windows ZIP。

## 已核实的来源

用户指定对话：codex://threads/01a13dd9-7d6b-7351-a5f5-2b8bdeed1d96（V2.3 视觉升级）。本轮采用其最新依赖诊断，以及当前视觉工作区实际 HEAD。

- 源工作区：`/Users/zhouzhijun/Documents/UED Asset Hub Visual Refresh/workspace`。
- 基线 Commit：`de63f916bf5739ae71b4e3f35127f12c703f9e75`。
- 基线 Tree：`42966b0e69d92a05da243779660cebf5dd120cc7`。
- V2.5 分支：`codex/v2.5-competition-delivery`。
- 本轮隔离仓库：`/private/tmp/ued-v25-competition-delivery`。使用 `git clone --no-hardlinks --no-checkout --single-branch` 从源工作区本地克隆，然后从上述 Commit 创建分支。独立 .git、独立索引、独立对象文件；不修改原仓库引用或索引。origin 仅为本地源路径。
- 聊天 cwd 主仓库的 main 为 `fa14eaa62553109eb9cf6d6a39b545fff6b8fd38`，不是本次基线。
- 原 3047 监听 PID 为 14612；未调用其控制接口或修改运行源码、配置、DATA。
- 不执行 Push、合并、生产部署、旧 Release 清理或真实凭据读取。用户本轮允许沿用SSH Windows主机的全新隔离目录进行构建验证；全部新产物位于D盘。

用户提供的 V2.5 Prompt 是本次执行范围；其目标不自动构成实现或验收证据。先前诊断不授权生产部署。

## 52原则来源门禁

原视觉工作区存在两份已跟踪文件修改与十二份新增源码/报告文件（见 baseline-evidence.json）。这些改动不在 de63f916 的提交树中，本轮未自动纳入、未在原工作区提交。已记录十四份文件的 SHA-256 和 git status，便于结束时复核保留状态。

最小纳入方式：获得用户同意后，仅复制清单内文件到 V2.5 副本，复核导航差异、运行 verify-design-principles、typecheck 及独立构建，再只在新分支提交。无需 stash/reset/clean，也无需改动原视觉工作区。不能在尚未纳入时声称最终发行已包含52原则。

## 可复用的现有发行链

| 环节 | 复用点 | 本轮核实的缺口 |
|---|---|---|
| 源导出与构建 | export-internal-release-inputs.mjs、build-internal-windows-release.ps1、internal-release-contract.mjs | 旧包缺 Node/Git/完整 DSH；完整比赛外层包尚未实现 |
| 安装/激活/回退 | install/activate/rollback/status-internal-release.ps1、Internal-Release.Common.psm1 | status 是发行指针核验，不证明运行健康；首次 GUI 配置未实现 |
| 日常启动 | start-current-internal-release.ps1 → start-internal-release.ps1 → start-host.mjs → host-supervisor.mjs | PATH Node；交互和 Service 的凭据载入条件不同 |
| DSH 来源与准备 | install-internal-dsh-runtime.ps1、来源 bundle/commit/tree 校验 | 现安装流程在目标机 install/build，原生构件回退可能需要编译工具；不能直接作为普通用户首装 |
| GenUI | 官方 Plugin Manager、固定 tgz、受限 preset、bootstrap/liveness/Haldur 读取补丁 | tgz 不是完整 profile，必须在隔离 Windows 构建机准备完整依赖 |
| 停止与进程收敛 | Windows Job、runtime-control-bridge、windows-managed-shutdown-client.mjs | 现 shutdown client 要求 Service 模式，不能直接当双击版通用停止入口 |
| 凭据 | DPAPI helper、bundle schema、子进程环境白名单 | 直接复用Web模型设置与credentials-local，不新增加密/凭据管理；见CREDENTIALS-DECISION.md |

## 实施顺序与验证

1. 基线与保护 → 验证：独立 Git、精确 Commit/Tree、源改动哈希不变；本轮已做。
2. 模型设置复用 → 已按用户调整范围：后台自行输入Key，沿用持久DSH_HOME；不开发DPAPI API Key适配。验证现有管理员鉴权与重启保留，不将文件权限/掩码描述为加密。
3. Windows 依赖收口 → 复用 Internal Release 构建器，维护者在已授权的全新 Windows x64 构建目录准备 Node/Git、DSH authority/runtime、GenUI profile、helpers 和完整许可。验证架构/ABI、原生装载、锁定版本和逐文件哈希；不得复制 Mac node_modules 或作者 DSH_HOME。
4. 首装向导 → 选新目录、路径/空间/ACL/重解析点预检、明确确认、只写非敏感路径配置、准备本实例 Runtime。验证中文/空格、取消、已存在目录、磁盘不足、逐步失败和精确恢复。
5. 双击启动/停止 → 入口名严格为 `轻点击我启动.cmd` 与 `停止运行.cmd`。仅在本安装身份与端口绑定核实后复用 Supervisor 和现有受控停止；存活实例只打开原地址，其他端口占用直接报错。验证重复双击竞争、健康超时、错误身份与完整进程树收敛。浏览器只在健康就绪后打开。
6. 打包与新机验收 → 交付不可变 app、tools、licenses、manifest 与 README。源码身份包含所有已提交修复；最终构建后生成 ZIP SHA-256。干净 Windows 普通用户实际首装、停止、复启和功能烟测通过后才可声明一键可用。

## 目录契约（待实现）

新装的一个持久总目录下建立互不包含的兄弟目录：

| 环境变量 | 新装相对路径 |
|---|---|
| DATA_DIR | hub-data |
| TRAINING_MEDIA_DIR | training-media |
| HALDUR_DESIGN_SKILL_ROOT | Haldur-Design-Skill |
| HALDUR_DESIGN_SKILL_RUNTIME_ROOT | haldur-runtime |
| AGENT_RUNTIME_DIR | agent-runtime |
| ASSET_HUB_RUNTIME_DIR | asset-hub-runtime |

DSH_HOME 由既有运行路径逻辑落在 Agent Runtime；非敏感路径配置放在受保护config；Key仍由原有DSH设置存储。程序和工具仍在独立解压目录；DSH_SOURCE_DIR 与 DSH_RUNTIME_SOURCE_DIR 是依赖代码，放在独立安装依赖目录，不放入用户选定的数据根。现有 DSH 安装器要求二者同父目录，且与 DATA、Agent Runtime、Release 互不包含，不能绕过此要求。

已有 Windows 安装继续使用原本可能分散的各路径。遇到已有数据只读核对并提示，不自动初始化、植入样例、迁移或修复。已保存路径丢失即报错，不新建空目录。首装中断只清理由本次确切创建且可验证为空的内容，其他内容保留供恢复。

## 本轮继续实施与实际边界

- 新增prepare-competition-tools.ps1：固定Node22.23.2与MinGit2.53.0.2，区分ZIP与exe哈希，在新目录下载校验。
- 新增prepare-competition-dsh.ps1：在新目录调用原DSH安装脚本与官方Plugin Manager，缓存/TEMP在D盘，仅生成全新profile，不访问旧Runtime/DATA。
- 新增首次目录初始化、可迁移依赖链接快照/恢复、中文CMD入口及competition-launch.ps1。入口复用现有Supervisor/管理员鉴权的停止接口，生产安全校验保持启用。
- 新增候选包构建与ZIP脚本；成品须来自同一干净提交，不能用旧ZIP替代当前构建；没有完整构件时直接失败。
- 目录/链接图合成测试已通过；Windows原生解析、实际依赖构建与首装证据将另记。脚本存在不等于双击和整栈已通过。

Windows隔离根：`D:\UED-V25-Competition-20261019-01a15349`，包括transfer/tools/temp/cache/build/dependency preparation及候选ZIP。原服务UEDAssetHubR2C及3080–3082保持保护，不复用其DATA、Runtime或凭据。本机Developer Mode当前未启用；实际符号链接权限要通过新目录合成探针确认，不修改策略以绕过来源校验。

现有生产登录要求管理员启动配置和受信HTTPS。这些前提尚未由新装向导自动准备；在不修改原安全机制/不新增凭据管理的范围内，若无法完成普通用户首装，必须列为交付阻断，不能用开发模式、默认密码或证书验证绕过作为成品。已用过的SSH主机隔离测试也不等于干净新机。
