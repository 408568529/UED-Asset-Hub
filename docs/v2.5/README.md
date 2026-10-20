# UED Asset Hub V2.5 本机发行候选包

Windows x64 与 macOS Apple Silicon 分别提供独立 ZIP。当前为候选交付；真实干净环境首启尚未完成，状态为 **NEW_MACHINE_NOT_VERIFIED**，不得据此宣称“解压即用”。具体构建和隔离验收结果见随交付报告。

## 一、检测

核对 ZIP 对应 SHA-256，完整解压程序文件夹。Windows 程序和新数据必须放在 C 盘之外；macOS 仅支持 Apple Silicon。保留 app、dependencies、tools、licenses 和 competition-manifest.json。

双击 `01-检测运行环境.cmd`（Windows）或 `01-检测运行环境.command`（Mac）。检测系统、架构、完整性、便携工具、权限和端口，通过时显示“可以启动”。检测只读，不初始化业务目录、不读取凭据、不清理进程、不修改系统 PATH。若 Windows 缺少文件符号链接权限，按检测提示由本机管理员配置权限后重试；不会自动修改系统策略。

## 二、配置

双击 `02-轻点击我启动` 对应平台入口，先打开独立的「启动与环境预检中心」。Hub / DSH 未运行时页面也能打开。页面使用随包预构建的 Ant Design / React 静态资源，直接沿用 Hub 的 `KnowledgeThemeProvider` 与 `--uedv-*` Token，无 CDN、无用户侧前端编译。

页面按「环境检查、数据目录、运行模式、运行状态」四步组织；每项显示实际检查结果，可重新检查。未检查通过不能初始化或启动。先选择外部目录，再为新实例输入一个尚不存在的子目录，设置至少 12 位的新管理员密码，并勾选明确确认后初始化。没有默认密码。若目录已有数据，使用「识别并沿用原安装」核对同一程序目录的安装标记、路径与权限，不初始化、不迁移、不覆盖。其他版本或原服务器数据无法安全识别时请使用原入口。

数据目录内包含 hub-data、training-media、agent-runtime、asset-hub-runtime、Haldur-Design-Skill、haldur-runtime 和 config。程序与数据分离；不包含作者 DATA、DSH_HOME、会话或 GenUI 成果。程序目录仅保存非敏感安装位置、运行状态和构件链接信息。首次启动只恢复预备构件的链接和初始化全新数据，不 clone、不安装 npm/pnpm 包、不编译 DSH、不安装 GenUI。

## 三、启动

默认选择本机模式，检查与配置完成后点击「启动 UED Asset Hub」，通过原 Supervisor 启动完整服务。页面显示操作进度、实际结果和可恢复错误；就绪后打开实际访问地址。首次缺少模型 Key 时进入原 DSH 模型设置页面，仍须用本实例管理员登录。再次双击复用同一启动中心和已有实例，不重复初始化、安装或重置配置。

启动后自动打开 `http://127.0.0.1:3247`。发行包显式启用独立本机模式，Hub、DSH、Gateway、Proxy 入口均绑定 127.0.0.1；局域网不能访问。不需用户准备 HTTPS 证书。本机 HTTP Session Cookie 使用 HttpOnly、SameSite=Lax；只有通过本机发行校验时才允许非 Secure Cookie，并保留管理员鉴权、Host、Origin/CSRF 检查。Windows Service、局域网和公网部署仍须原 HTTPS / Secure Cookie 配置，此入口不承担服务器升级。

### 在已有后台配置 DeepSeek

1. 用首次设置的管理员账号进入 `/admin/login`。
2. 打开悠鼎 Agent 的“模型设置” `/agent/settings`。
3. 填写本人获准使用的 DeepSeek API Key、Base URL 和模型并保存。需要联网且可能产生模型费用。
4. 后续启动复用同一外置数据目录和原有配置，不重复要求输入 Key。修改或删除仍在原设置页操作。

启动器不提供独立 API Key 输入或凭据管理界面，不预置 Key，不向 ZIP、Git、README、命令行或日志写入 Key。不得把凭据发给开发者。本机入口隔离继承的模型 Key 环境变量，避免遮蔽后台文件配置，不显示其内容。

**凭据存储安全边界：** 原 DSH credentials-local 默认将 API Key 保存于 `<AGENT_RUNTIME_DIR>/dsh-home/.credentials.yaml`，依靠原有文件权限和账户访问控制，不能称为加密存储；密码掩码不代表磁盘加密。本轮不新增 DPAPI API Key 适配、不修改 DSH 核心及其原有安全机制。发行启动所需管理员配置位于外置 `config/host-login.json`，也受账户权限保护，不能描述成加密。备份数据及配置时须保护其中敏感信息。

## 四、使用 / 退出

重复双击启动入口会识别本安装并打开原地址，不启动第二套服务。双击 `03-停止运行` 通过原管理员受控停止接口停止本安装，等待子进程退出和端口释放，不强杀其他进程。

再次启动复用数据、会话、GenUI 及模型设置，不重复安装或重置。目录丢失、哈希错误、缺依赖或端口占用会明确停止；不会悄悄创建空数据库或杀掉占用进程。默认端口为 3247、3248、3347、3348、3349。原 Mac 3047 和 Windows 正式服务独立保留。

「停止本安装」或原 `03-停止运行` 复用鉴权停止流程，仅控制有实例身份和所有权证明的本安装，不按进程名杀进程。关闭网页不会停止服务；「退出启动中心」只退出轻量控制进程，Hub 保持原状态。控制通道绑定随机 127.0.0.1 端口，使用当前账户私有的随机能力令牌及 Host/Origin/CSRF 检查；`.launch-center/control.json` 是临时控制状态，不包含模型 Key，不得分享该文件或页面首次授权链接。

## 可选：局域网共享模式（Windows 既有 HTTPS 部署方式）

启动中心会显示 LAN 待配置并拒绝直接启用共享。便携新安装没有证书、HTTPS 代理和防火墙配置时，不能视为零配置 LAN。完成下述原有受保护部署前置后，使用原共享启动入口；本轮不新增网络配置后台、不自动签发证书或修改系统访问规则。

V2.5 保留 Windows 正式版本的局域网多人访问能力。编号双击入口默认用于本机模式；共享由管理员明确配置后通过既有 Windows 部署/启动入口运行同一 Hub、Supervisor、DSH 与 GenUI，不把本机 HTTP 入口直接开放到局域网。

1. 复用现有 HTTPS 前置代理（如 IIS ARR/WebSocket）。由管理员准备与局域网访问域名匹配、客户端信任的证书、DNS 和访问规则；本轮不自动签发证书。将随包 `app/service/windows/UEDAssetHubEdge.web.config.template` 按目标实例端口配置为转发到 127.0.0.1 的 Supervisor，并保留 Host 与 WebSocket。
2. 在该共享实例的受保护外部配置中显式设置 `NODE_ENV=production`、`PUBLIC_ORIGIN=https://该实例的访问域名`、`ADMIN_SESSION_SECURE=true`、`HOST_BIND_HOST=127.0.0.1`。不得设置 `UED_LOCAL_DISTRIBUTION_MODE`、`UED_LOCAL_TEST_MODE` 或 `UED_LOCAL_DEMO_MODE`；不得将 `ADMIN_SESSION_SECURE` 改成 false。
3. 复用原 Windows 服务/隔离发行启动流程及管理员、Session Secret、Gateway Token 的原有受保护配置。随包 `app/service/windows/internal-runtime-config.example.psd1` 只保存外部路径和端口；使用原 `app/scripts/start-internal-release.ps1 -ConfigPath <外部配置>` 或既有服务入口启动。使用随包便携 Node/Git 的进程 PATH；不修改系统 PATH。不要把任何真实密码、Key 或 Token 写入模板、README 或 ZIP。
4. 数据、媒体、Agent、Haldur 路径可沿用既有分散目录；不得用本机首次向导覆盖服务器目录。同一目录不能同时运行两种模式，切换前用原实例的受控停止入口停止并确认端口释放。共享实例沿用其原有服务停止流程，本机 `03` 入口只控制本机向导创建的实例。
5. 客户端通过配置的 HTTPS 域名访问 Hub 和 `/agent/settings`，仍需管理员登录。Agent Proxy、Knowledge MCP 和 DSH 继续保持内部回环与原有鉴权/沙箱规则；不得直接将内部端口映射到局域网。浏览器 Cookie 须为 HttpOnly、SameSite 且 Secure。共享模式的实际隔离回归结果另见交付报告。

现有 Windows 正式服务、证书、站点、数据路径和访问方式不由本候选包自动改写。本机模式的成功不能代替局域网 HTTPS 多人访问验收；没有跨机器实际证据时标记 NOT_VERIFIED。

## 依赖、来源和边界

随包 Node 22.23.2、Git 2.53.0（Windows 为 2.53.0.windows.2）、固定 DSH 0.1.1-rc.2 / b150a551、GenUI 0.15.1 和对应平台依赖。Git 用于保留官方源码 HEAD、干净状态及来源校验，不能删除验证来掩盖依赖。macOS Git 仅用于本地来源验证，未提供网络传输能力。npm、pnpm、Corepack、编译工具链仅供维护者构建，普通用户不需要安装。受限 Preset、GenUI 沙箱、文件访问和权限隔离继续保留。

本地运行不需要首次下载编译；模型调用、网页外部资源仍需网络。许可证、版权通知、对应源码和来源见 licenses 及各依赖目录。Node 官方校验来源：https://nodejs.org/dist/v22.23.2/SHASUMS256.txt ；Git Windows：https://github.com/git-for-windows/git/releases/tag/v2.53.0.windows.2 ；Git 上游源码：https://www.kernel.org/pub/software/scm/git/ 。

macOS 随包 Git 的最低系统要求为 15.5；当前只在 26.1 arm64 原生验收，更早系统须另行验证。macOS 候选包未做 Developer ID 公证；系统若阻止未知来源程序，请由用户确认来源后按 macOS 安全设置操作，不提供关闭 Gatekeeper 的脚本。原生构建、隔离测试不等于干净机器 Finder 双击验收。

已有 Windows 服务器沿用原配置和存储路径，不由此启动器迁移。升级、回滚需保留外置数据及配置；程序回滚不等于数据回滚。52 原则未提交内容未纳入当前基线。功能可用性和真实模型调用以验收报告明确列出的证据为准。
