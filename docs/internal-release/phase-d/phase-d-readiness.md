# Phase D — Windows 内部交付准备

状态更新：2026-10-14。本文公开副本保留可公开的版本身份和验收结论；真实资产映射、Windows 主机/账户、内部端口、服务标识及精确 ACL 细节保留在受限运维证据中。

## Phase D 原快照

- 脱敏 GitHub `main` 基线为 `7545f41b300c227d8627558c6402aa38133b224b` / Tree `7c747f4b5eccb386c759a4bee3172a63f3ac3d46`。
- 原 C2 Windows ZIP SHA-256 为 `65f2af222d33090c3daef3e4d8fbe2542fbc4e13ab8496dcbc5cc002965d3475`；原始本地源提交身份与主机验收明细未随公开历史重引入。
- 先前旧 V1 隔离实例未收到停止信号；可寻址 PID/端口和控制台信息仅保存在受限操作记录。
- 受保护 Windows 服务保持原状，业务角色未知；真实 DATA、培训媒体、Agent/Hub Runtime 与 ACL 映射均只读核对，准确根路径、文件体量与权限主体不公开。
- Phase D 初始 Windows 合成资产覆盖有限，整体为 PARTIAL。

## Phase D.1 更新（2026-10-14）

在 Hub 子进程环境白名单中加入 Haldur source/runtime 两个路径，并扩展隔离边界回归。D1 Windows ZIP、完整安装、激活和 CheckOnly preflight 通过；D1 启动时登录 API 返回 HTTP 500，Haldur snapshot/编辑/导出未验证。D1 实例已 graceful shutdown，且没有遗留隔离进程、锁或监听。真实服务角色、真实资产根与服务账户 ACL 未确认。

## Phase D.2 更新（2026-10-14）

D1 登录 POST 500 已确认由隔离测试中的 `ADMIN_SESSION_SECURE=false` 与 standalone production 安全配置冲突引起。D2 使用 Secure Cookie + 合成 HTTPS edge 完成新 Windows ZIP 登录、Haldur snapshot/在线 Markdown/ZIP、重启持久性、缺失根 fail-closed 与 graceful-stop 验收。状态 `PASS_ISOLATED_FUNCTIONAL`，不是正式部署批准。跨账户 ACL 仍 PARTIAL，真实 Haldur root 与资产映射仍 UNKNOWN；详见 [D2 结案](phase-d2-closeout.md)。
