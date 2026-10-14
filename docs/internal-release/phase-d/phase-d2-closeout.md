# Phase D.2 — Windows Login 与 Haldur 最终隔离验收

实测日期：2026-10-14。状态：**PASS_ISOLATED_FUNCTIONAL**。这代表 D2 的合成隔离功能验收通过，不代表真实资产映射、跨账户 ACL 完成或生产部署获批。

## Git 与发行版身份

- Phase D.2 续接 Phase D.1 的本地验收；原始本地文档提交身份不放入公开历史。
- 被 Windows ZIP 精确构建的源 Commit：`baf94f22c6443bf4a2038cd8d42e8e2bdb929b1b`，Tree `47782c5a382fdbd4512984f1baa036df91554944`，Parent `7545f41b300c227d8627558c6402aa38133b224b`。
- D1 checkpoint 是 D1 修复 Commit 的后代，且远端完整脱敏 `origin/main` 是 D1 修复 Commit 的祖先。对象库不是 shallow clone；D2 未伪造或重写 Git 历史。
- 本轮新构建 Windows ZIP：`UED-Asset-Hub-internal-0.1.1-baf94f22c644-win-x64.zip`，SHA-256 `3aef41879d3b5b7cba611d9260feae7d019be032632e8ce3f2883d0db0e53302`，manifest 20,530 files / 388,364,927 bytes。该 hash 与 D1 ZIP 不同；D2 未复用 D1 ZIP 冒充新包。
- 该 ZIP 的原始构建 source Commit/tree 仅作隔离发行证据身份；原始本地文档提交对象不发布。公开备份以 `origin/main` 为基线，只迁移已审查的应用源码差异并使用去标识化 D1/D2 报告，不把公开提交冒充为 Windows ZIP 的构建 Commit。
- 公开安全备份身份：应用源码差异 `9d6472f7fdc854e87d68b180e5738152450cb76a`；去标识化 D1 文档 `5ceced6c599f0085cd49ba1e20733899cdacf0e9`。这些是公开迁移提交身份，不是 Windows ZIP 的原构建 Commit。
- 新包完整安装及激活于 `%LOCALAPPDATA%/<D2-SYNTHETIC-ROOT>/install/releases/internal-0.1.1-baf94f22c644-baf94f22c644`，安装文件数、包 hash、marker 和 CheckOnly preflight 均通过。
- 应用代码没有改动：复用 D1 Haldur root 透传修复与 8 项定向回归。为公开备份而重建的代码提交只含必要源文件；D1/D2 本地报告提交身份不作为公开提交历史发布。

## 登录 500 根因与修正

D1 的 `/api/auth/login` 500 是隔离测试启动配置错误，不是应关闭鉴权或放宽 Session 安全的代码缺陷。发行包的 Next standalone 进程以 `NODE_ENV=production` 运行；其登录调用链 `authenticateAdmin → getAdminSecurityConfig → resolveHostSecurityConfig` 会执行 production session security 校验。D1 测试启动时设置 `ADMIN_SESSION_SECURE=false`，与 production 模式的 Secure Cookie 要求冲突，导致安全配置异常沿登录 POST 变成 HTTP 500。对同一生产配置解析路径的确定性复现抛出 `HostSecurityConfigError`，字段为 `ADMIN_SESSION_SECURE`、原因码为 `host_security_config_invalid`。

D2 仅修正新的合成测试启动配置：`ADMIN_SESSION_SECURE=true`，`PUBLIC_ORIGIN=https://localhost:<isolated-edge-port>`，通过本轮新建的 localhost SAN 测试证书和隔离 HTTPS edge 访问 Hub。证书仅位于 D2 合成根；未写入系统信任库，也未修改现有 HTTPS 证书。认证、密码校验、Session 签名和 Cookie 校验代码均未绕过或放宽，故无须改应用源码。

## Windows HTTPS 验收

HTTPS 客户端经本地 Node TLS 校验信任 D2 的合成 localhost 证书访问 Windows 隔离实例；没有通过浏览器 UI 操作，因此本记录不声称浏览器点击验收。

| 检查 | 结果 |
|---|---|
| 错误密码 | HTTP 401，无 Session |
| 缺字段 `{}` 与 malformed JSON | 均 HTTP 401，不签发 Session Cookie |
| DPAPI 保护的合成管理员凭据 | HTTP 200 |
| Cookie 属性 | `Secure`、`HttpOnly`、`SameSite=Lax` 全部存在 |
| Session 刷新 | 当前实例认证状态保持 |
| A Cookie 到 B 实例 | B 返回未认证；无跨实例 Session 污染 |
| 未登录访问 Haldur | HTTP 403 |
| Agent Runtime | DSH 可用；因隔离包未配置模型 Key，状态为预期的 `configuration_required / credential_missing`；本轮不调用真实模型。 |
| 登出 | 响应清除浏览器 Cookie，清除 Cookie 后 Session 未认证、Haldur 返回 403 |

登出语义按实际 API 验证为清除客户端 Cookie；本测试没有声称服务端立即撤销一个仍被客户端重放的未过期 stateless token。

## Haldur 合成端到端验收

所有文件都由当前发行包提供的 Hub/Haldur API 创建或修改，测试文件只位于 D2 新建的 A/B 合成目录。A、B 的 DATA、training、Agent Runtime、Hub Runtime、DSH Runtime、Haldur source/runtime 路径彼此独立。D1 验证的 `HALDUR_DESIGN_SKILL_ROOT` 与 `HALDUR_DESIGN_SKILL_RUNTIME_ROOT` Hub 子进程透传修复在该包中生效。

- A 登录后 Haldur snapshot HTTP 200，`rootAvailable=true`；在线创建目录和 `SKILL.md`、`micro-standard/design.md`、`references/reference.md`、`examples/README.md`，snapshot 清单反映磁盘结构。
- 使用在线 Markdown API 更新 `SKILL.md`，HTTP 200；服务重启后再次通过 HTTPS 登录，API 内容和磁盘原始字节相同，SHA-256 为 `38195a46c1a321cc3fa3d0f9e6d7716751eaa8966817dbf36a22c9ce0e99d73e`。
- 对同名文件进行未授权覆盖返回 HTTP 409 / `NAME_CONFLICT`，原内容保留。
- Hub ZIP 下载返回 HTTP 200，1,999 bytes，SHA-256 `32ceab86037f3ef64094fca6ed4b0765e78b4c77ad8e594c6e735afc44f0eea6`。ZIP 有 4 个文件成员；相对路径安全、无目录穿越/绝对路径，逐成员内容 hash 与 A Haldur source 根一致，包含最新已保存 Markdown，unsafe member 数为 0。
- B 的 Haldur 根配置为空时，受认证 snapshot 返回 HTTP 503、`rootAvailable=false`、空 manifest、诊断码 `root-missing`，没有回退至 A 或默认/真实路径。B 配置为自身隔离根时 manifest 为空且不包含 A 的 Skill。
- 合成资产 Smoke：复用 D1 已通过的 Knowledge MCP、组件、字体、培训媒体 Range、A/B 路径和重启持久性证据；D2 未重复 30 分钟 soak、真实模型 QA 或更新回滚全套。

## 停机、安全边界与剩余事项

- A/B 两个隔离 Supervisor 均经过 SIGINT graceful shutdown；各自生命周期包含 `managed-shutdown-entered`、`metadata-flushed`、`managed-components-converged`、`finalization-completed`。Proxy、DSH、Gateway、Hub 退出码均为 0。
- 最终只读复核：A/B 的 12 个隔离端口（具体值留在受限证据中）无监听；D2 进程为 0，Supervisor lock 为 0。Supervisor、Node TLS edge 均已退出；没有保留新的后台实例。
- 受保护 Windows 服务仅只读检查且状态为 Running。旧 V1、既有 staging、正式服务、生产 DATA、真实资产源、凭据和既有证书均未修改；没有 Push 或正式部署。
- 第二个受限 Windows 账户不可用，跨账户 ACL 为 `PARTIAL`；未提权、未改真实 ACL。真实 Haldur 根仍 `UNKNOWN`。此前旧 V1 的原生停机待操作员处理，不在本轮触碰。
- 最小后续步骤：由资产责任人确认真实 Haldur source/runtime、DATA 与培训媒体根路径及服务账户权限，并提供不涉及提权的第二测试主体/ACL 验证安排；任何生产切换仍需单独部署授权。

## Evidence

Windows 隔离 evidence 根：`%LOCALAPPDATA%/<D2-SYNTHETIC-ROOT>/evidence`。证据 index `phase-d2-evidence-index.json` SHA-256 `381fc4fc3e12fce917744ffec9b1af1d9198bd3dabbe80bb6ce4d37cdc2180c4`；聚合结果 `phase-d2-closeout-summary.json` SHA-256 `17079051e8d13277aa36cef1e5bfd70aacc45f100babfcc6ebc6642f12c75509`。Index 包含探针、ZIP 成员校验、缺根 fail-closed、最终停机和摘要的文件名、字节数与 SHA-256。

重启验证的首次探针尝试错误地要求登出后服务器撤销被重放的 stateless cookie，因此该探针结果保留为 FAIL；修正后的探针只验证产品当前合同（登出清除浏览器 Cookie、之后无 Cookie 的请求未认证）并 PASS。两份证据均保留，未覆盖失败记录。
