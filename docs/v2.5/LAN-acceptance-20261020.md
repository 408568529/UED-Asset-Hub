# V2.5 Windows 局域网共享：开发与隔离验收

日期：2026-10-20。分支：`codex/v2.5-competition-delivery`。

本轮补齐启动中心首次 LAN 配置，复用现有 HTTPS → 回环 Supervisor → Hub / Agent Proxy 机制。不改生产服务，不把 HTTP 本机模式开放到网络。

## 实现

- 自动检测 RFC1918 IPv4 和可绑定 HTTPS 端口，允许确认 IP/域名；域名须解析到选定地址。
- 当前安装数据根内的 PEM 证书与私钥配置；校验 SAN、期限、服务器用途、私钥配对、真实 TLS 信任链及文件/ACL 边界。复用本安装的已验证配置，不读取其他实例私钥。
- 明示客户端信任要求，不自动签发或导入 CA、不忽略浏览器证书错误；失败不降级为 LAN HTTP。
- 防火墙先检查、再明确确认；只新增本安装 Node 程序、指定 IP/端口的 Domain/Private + LocalSubnet 规则。同名异配置规则拒绝覆盖。
- 独立 HTTPS 监听，内部服务继续回环；保留 Secure Cookie、管理员鉴权、Host/Origin 校验、受限 Agent 和 GenUI。
- 显示、复制真实 HTTPS 地址；非敏感运行记录保存在外部 `config/launch-mode.json`。再次双击重新校验并复用；切换模式须受控停止本安装。

## 环境和证据边界

Windows 隔离程序：`D:\UED-V25-LAN-20261020\UED-Asset-Hub`；隔离数据：同级 `data`；HTTPS：`https://172.17.1.100:4483`。

仅复用旧完整 ZIP 的原生依赖闭包，覆盖当前开发脚本与已编译 Hub；清单显式标为 developmentOverlay。**未重新构建发行 ZIP，不是干净 Windows 下载双击的完整发布验收。** 首次夹具使用旧初始化脚本造成微规范根配置缺失，真实请求检出 500/503；已仅在此隔离数据根补齐配置，受控停止/再启动后微规范页面和接口均返回 200；保留修正前的失败证据。当前源码首次初始化脚本已包含独立微规范目录及索引，不需要放宽该边界。

新测试 CA 为本轮生成，7 天有效。只把叶证书私钥和公共 CA 放入隔离数据；CA 私钥未传到 Windows。Mac 钥匙串未导入 CA。用户仅授权防火墙新增规则：`UED V25 LAN a4b9feef7d97 HTTPS 4483`。已另获用户授权，仅在独立 Chrome for Testing 临时 Profile 导入公共 CA；验收后已从证书管理器删除、确认 HTTPS 重新拒绝该证书并清理临时浏览器。系统钥匙串和日常 Chrome 证书数据库的前后摘要一致。

## 验收表

| 项目 | 状态 | 实际证据 / 限制 |
|---|---|---|
| 原本机 HTTP 安全边界 | PASS | `verify-local-distribution-security.mjs`：仅回环、弱密码拒绝、Host/Origin，正式 HTTPS 配置规则保持 |
| 首次配置/已有数据保护 | PASS | `verify-competition-first-run.mjs`：显式确认、中文/空格路径、已有目录不覆盖、链接路径拒绝 |
| 地址、证书、私钥、信任、非敏感持久化 | PASS | `verify-competition-lan.mjs`：实际 TLS 握手、错误 SAN/私钥/信任/权限拒绝 |
| HTTPS / WebSocket 转发及安全头 | PASS | 同上，真实 TLS 和 upgrade 通道往返、Secure Cookie、伪造 forwarding 头替换、恶意 Host/Origin 拒绝 |
| 启动中心流程与控制边界 | PASS | `verify-competition-center.mjs` 注入协议夹具；未配置拒绝、授权控制、不能任意执行命令；不代表原生 GUI 全链路 |
| Typecheck / Supervisor 安全回归 | PASS | `tsc --noEmit --incremental false`、`verify-host-security-config.mjs`、`verify-runtime-supervisor.mjs` |
| 原生 Windows 配置与防火墙 | PASS | 实际 SAN/TLS/ACL 检查；授权后新增指定规则并读回，Domain/Private、LocalSubnet、172.17.1.100、4483、程序路径精确匹配 |
| 原生 Windows 构件完整性 | PASS | 启动中心实际核对 138,201 文件；Node 22.23.2、Git 2.53.0.windows.2 |
| 原生 HTTPS 启动 / 保存配置复用 | PASS | 原启动器 Start 成功，中心实际恢复 LAN 字段并复用，首次无 Key 时准确显示 `configuration_required / credential_missing`，用户自行配置后 Runtime 为 `ready`；截图 `native-lan-certificate-form.png` |
| Mac 跨电脑 TLS | PASS | `curl --cacert` 到 Windows 4483 返回 200，未忽略 TLS 错误；不是浏览器证明 |
| 受控停止 / 再次启动 / 微规范夹具修正 | PASS | 原启动器 Stop 与 Start 实际通过；原会话/依赖路径未重建，微规范页和接口修正后均 200 |
| 跨电脑模块路由与管理员登录 | PASS | Mac 验证 CA 的 HTTPS：Knowledge、Haldur、微规范页面及接口 200；登录 Secure/HttpOnly/SameSite=Lax，用户配置后运行诊断 ready，退出 200；此行仅指协议验收 |
| 跨电脑浏览器知识库 / Haldur / 微规范 | PASS | Mac Chrome for Testing 正常校验证书后实际打开 Windows 三个模块、读取正文；访客编辑转登录，管理员登录有效；`trusted-browser-micro-standard.png` |
| 真实 Agent / Knowledge MCP 检索、全文与引用 | PASS | DeepSeek-V4-Flash High，现有受限助手，实际搜索并全文读取两份合成资料，返回 `LAN-HTTPS-20261020` 与两条 asset-hub 来源；工具轨迹与 `genui-real-state-readback.png` |
| Haldur SKILL 正文读取 | PASS | 模型真实调用 `get_haldur_skill_document`，完整读到 34 字，nextOffset 为 null；合成 SKILL SHA-256 `ba1d71b6b478bf2a0a524cddc96cc92d69eb88e2da82948b590e8e5cd04dc759` |
| Haldur 完整设计流程 → GenUI（用例 A） | PARTIAL | 隔离合成 SKILL 仅说明用途，缺少核心流程及规范文件；现有门禁正确拒绝生成。未修改门禁或补造设计依据；不声称已完成完整规范设计验收。`real-agent-mcp-citations.png` |
| 普通 GenUI 生成、交互、保存、刷新恢复（用例 B） | PASS | 独立新会话、不声明依赖 Haldur；真实 genui_create，浏览器点击两次、备注 browser-lan-r1、保存后普通刷新，计数 2 和备注均恢复；`genui-after-refresh.ax.txt` |
| 真实 GenUI 状态工具读回 | PASS | 轨迹中 genui_state_read 返回 counter=2、note=browser-lan-r1 及 __result；并非仅模型自述。`real-model-tool-trajectory.ax.txt` |
| 临时信任范围、撤销与清理 | PASS | 临时 Profile 的 Custom 用户证书库导入公共证书，撤销后显示“没有证书”，重新访问出现正常证书拒绝；临时浏览器退出且目录已删，系统与日常 Chrome 证书摘要未变；`temporary-trust-revoked.json` |
| 原 Windows 正式服务 / Mac 3047 | PASS | 4443 PID 1908、4453 PID 14124 保持；本轮未修改/重启 Mac 3047 |
| 新发行 ZIP / 干净新机器首次安装 | NOT_VERIFIED | 本轮未构建 ZIP，现有隔离运行不能替代该项 |

## 操作约束与撤销

没有 Push、合并 main、正式部署或变更稳定数据。测试规则只属于本轮隔离程序；经授权清理时可用 `Remove-NetFirewallRule -Name 'UED V25 LAN a4b9feef7d97 HTTPS 4483'` 精确撤销，不按端口批量删除。测试证书到期后必须重新配置，不能把当前 7 天证书作为正式交付。

浏览器临时信任限定在 `/private/tmp/ued-v25-lan-browser-u67w5oz6`，已按授权撤销并删除 Profile、官方来源的专用测试 Chrome 及本轮临时登录文件，释放约 620 MB（文件逻辑大小）。Mac 临时 CA 私钥和叶证书私钥副本也已删除；Windows 隔离实例自己的受保护叶证书配置、运行数据、生成的验收会话与 GenUI 保留。新隔离实例的模型 Key 由用户自行输入，未读取或写入 Git。

## 临时浏览器信任评估

Chromium [证书管理说明](https://chromium.googlesource.com/chromium/src/+/main/net/data/ssl/chrome_root_store/faq.md)提供 Chrome 134+ 的 `chrome://certificate-manager`；[用户证书数据库源码](https://chromium.googlesource.com/chromium/src/+/refs/tags/138.0.7163.2/components/server_certificate_database/server_certificate_database.h)将用户配置的 TLS 证书保存在 Profile 目录数据库。因此优先独立 user-data-dir，且只经其用户证书界面操作。本轮已核对实际浏览器 Profile 路径、Custom 用户证书库、公共 CA 指纹和前后信任摘要；未进入系统证书导入。公共 CA SHA-256：`08:5E:21:33:00:B2:C6:AD:2F:D8:94:AE:42:A3:69:D3:68:B7:A0:A0:09:CB:D4:E0:70:38:69:D8:BB:EE:03:CB`。正常校验通过后运行真实测试；撤销后正常拒绝证书，未绕过 HTTPS 警告。

## 实际模型与 GenUI 结果

调用模型前分别固定用例 A、B 的输入和预期，原始记录在 `roadshow-output/v25-lan-20261020/model-test-contract*.json`。用例 A 的合成 Skill 缺口与被拦截结果保留，未以用例 B 覆盖该限制。

用例 B 应用 ID：`s-e7ec021bec04-lan-https-interaction-acceptance`；版本：`v-75ec60f7-79a4-44d7-9d5b-576537cbb230`。状态工具实际返回更新时间 `2026-10-20T07:17:31.709Z`，计数 2、备注 browser-lan-r1，保存结果时间 `2026-10-20T07:17:31.611Z`。工具返回状态有效期至 `2026-10-27T07:17:31.709Z`，因此这里只证明既有 7 天状态策略内的保存与刷新，不代表无限期归档。

完整截图、AX 工具轨迹及非敏感校验 JSON 位于 Mac `/Users/zhouzhijun/Documents/UED Asset Hub/roadshow-output/v25-lan-20261020`，不把浏览器 Profile、运行数据或凭据加入代码提交。最终 Windows 监听：4443 PID 1908、4453 PID 14124 保持，隔离 4483 PID 12932；授权规则为 Domain/Private + LocalSubnet，精确限定新程序与绑定 IP。

## 交付结论

局域网首次配置、HTTPS 启动和跨电脑代表性功能通过隔离验收。代码提交为 `417d5c93f80146c6212c6e978c84b203bba6fb3a`。没有 Push、合并、正式部署或重打 ZIP。下载完整新 ZIP 后的干净安装仍为 NOT_VERIFIED；完整真实 Haldur 设计流程不在本次合成样本可证明的范围内。正常使用自签 CA 的其他客户端仍须由管理员完成受控信任，当前测试 CA 已从 Mac 撤销，不会在日常浏览器中继续被信任。
