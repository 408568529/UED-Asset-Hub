# UED Asset Hub V2.5 本机发行候选包

Windows x64 与 macOS Apple Silicon 分别提供独立 ZIP。当前为候选交付；真实干净环境首启尚未完成，状态为 **NEW_MACHINE_NOT_VERIFIED**，不得据此宣称“解压即用”。具体构建和隔离验收结果见随交付报告。

## 一、检测

核对 ZIP 对应 SHA-256，完整解压程序文件夹。Windows 程序和新数据必须放在 C 盘之外；macOS 仅支持 Apple Silicon。保留 app、dependencies、tools、licenses 和 competition-manifest.json。

双击 `01-检测运行环境.cmd`（Windows）或 `01-检测运行环境.command`（Mac）。检测系统、架构、完整性、便携工具、权限和端口，通过时显示“可以启动”。检测只读，不初始化业务目录、不读取凭据、不清理进程、不修改系统 PATH。若 Windows 缺少文件符号链接权限，按检测提示由本机管理员配置权限后重试；不会自动修改系统策略。

## 二、配置

双击 `02-轻点击我启动` 对应平台入口，先打开独立的「启动与环境预检中心」。Hub / DSH 未运行时页面也能打开。页面使用随包预构建的 Ant Design / React 静态资源，直接沿用 Hub 的 `KnowledgeThemeProvider` 与 `--uedv-*` Token，无 CDN、无用户侧前端编译。

页面按「环境检查、数据目录、运行模式、运行状态」四步组织；每项显示实际检查结果，可重新检查。未检查通过不能初始化或启动。先选择外部目录，再为新实例输入一个尚不存在的子目录，设置至少 12 位的新管理员密码，并勾选明确确认后初始化。没有默认密码。若目录已有数据，使用「识别并沿用原安装」核对同一程序目录的安装标记、路径与权限，不初始化、不迁移、不覆盖。其他版本或原服务器数据无法安全识别时请使用原入口。

### Agent 访客使用

比赛发行版默认允许访客使用受限 Agent、共享会话与 GenUI，行为与 Mac 3047 演示一致。首次初始化会在外部数据目录的 `config/runtime.json` 持久化 `AGENT_PUBLIC_ACCESS: "true"`；旧的比赛安装未包含此字段时，发行启动器采用同样的默认值，不改写已有配置文件。已显式设置为 `"false"` 的安装继续要求 Agent 登录，不会被自动覆盖。

普通源码启动的 `.env.example` 也包含 `AGENT_PUBLIC_ACCESS=true`。已有测试或服务器配置若显式设为 `false`，仍沿用该设置；本次源码更新不会改动正在运行的环境。模型 Key、模型设置和管理接口仍要求管理员登录；访客仅可使用现有接口白名单，GenUI 的能力校验及 Host/Origin 校验保持不变。

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

## 可选：局域网共享模式（Windows）

在 `02-启动` 打开的启动中心选择「局域网共享」，完成当前安装的 HTTPS 配置。配置未通过时不能启动，不会降级为局域网 HTTP。

1. 点击检测，确认本机实际内网 IPv4、绑定地址及空闲 HTTPS 端口；使用域名时，其 DNS 必须指向所选地址。仅支持可信的 Domain/Private 局域网。
2. 优先复用本安装已经验证并保存的证书配置。首次配置时，将获准使用的 PEM 服务端证书、对应私钥和必要的 CA 公共证书放在本安装外部数据目录下，填写绝对路径。证书须在有效期内、包含访问 IP/域名的 SAN 和 serverAuth 用途；私钥权限只允许当前账户、SYSTEM、Administrators。不得复制其他实例的私钥。
3. 客户端必须信任签发 CA。只分发 CA 公共证书，绝不分发 CA 私钥。测试证书不代表正式可用证书；到期或地址变更须重新校验。客户端不信任时应按组织策略配置信任，不能忽略浏览器安全警告。
4. 启动中心显示本安装的防火墙计划。缺少规则时须用户明确确认，并以管理员权限重新打开启动中心；只为本安装 Node 程序、指定 IP/端口创建 Domain/Private + LocalSubnet 入站规则，不改已有规则，不开放 Public 网络。
5. 校验通过后点击启动。复用现有 HTTPS 前置代理到回环 Supervisor 的机制，内部 Hub、DSH、Gateway 和 Agent Proxy 仍绑定 127.0.0.1。保留管理员鉴权、Secure / HttpOnly / SameSite Cookie、Host/Origin 校验及 GenUI 沙箱。
6. 启动成功后显示真实 HTTPS 地址并支持复制。已验证的模式与非敏感配置保存在本安装数据目录的 `config/launch-mode.json`；后续双击入口重新校验证书、地址和规则后复用。切换模式前必须受控停止本安装，不覆盖数据或控制其他实例。

现有 Windows 正式服务、证书、端口和数据不由该流程改写。跨电脑浏览器的知识库、Haldur、微规范、Agent 和 GenUI 须单独验收，不能以路由 200 或本机 HTTP 成功代替。当前隔离验证状态见 LAN 验收报告；未重新构建发行 ZIP。

## 依赖、来源和边界

随包 Node 22.23.2、Git 2.53.0（Windows 为 2.53.0.windows.2）、固定 DSH 0.1.1-rc.2 / b150a551、GenUI 0.15.1 和对应平台依赖。Git 用于保留官方源码 HEAD、干净状态及来源校验，不能删除验证来掩盖依赖。macOS Git 仅用于本地来源验证，未提供网络传输能力。npm、pnpm、Corepack、编译工具链仅供维护者构建，普通用户不需要安装。受限 Preset、GenUI 沙箱、文件访问和权限隔离继续保留。

本地运行不需要首次下载编译；模型调用、网页外部资源仍需网络。许可证、版权通知、对应源码和来源见 licenses 及各依赖目录。Node 官方校验来源：https://nodejs.org/dist/v22.23.2/SHASUMS256.txt ；Git Windows：https://github.com/git-for-windows/git/releases/tag/v2.53.0.windows.2 ；Git 上游源码：https://www.kernel.org/pub/software/scm/git/ 。

macOS 随包 Git 的最低系统要求为 15.5；当前只在 26.1 arm64 原生验收，更早系统须另行验证。macOS 候选包未做 Developer ID 公证；系统若阻止未知来源程序，请由用户确认来源后按 macOS 安全设置操作，不提供关闭 Gatekeeper 的脚本。原生构建、隔离测试不等于干净机器 Finder 双击验收。

已有 Windows 服务器沿用原配置和存储路径，不由此启动器迁移。升级、回滚需保留外置数据及配置；程序回滚不等于数据回滚。52 原则未提交内容未纳入当前基线。功能可用性和真实模型调用以验收报告明确列出的证据为准。

### 微规范独立资产目录

顶部「微规范」使用独立 `micro-standards/`，与知识库 DATA 和 Haldur 分离。新安装仅在确认资产根后创建空目录；老安装需先完成显式迁移，再配置 `MICRO_STANDARD_ROOT`，后续启动不重复迁移。原目录缺失时不会自动创建空库。Windows升级继续保留原服务器各项绝对存储路径。

访客可阅读与下载；管理员选择已有主题创建/编辑，主题需单独新建。旧引用ID继续有效，Haldur Skill ZIP不自动包含独立微规范。若以后明确进行业务备份，范围须额外包含微规范根及索引，不能只备份DATA。维护步骤见 `docs/micro-standards/STORAGE-AND-MIGRATION.md`。
