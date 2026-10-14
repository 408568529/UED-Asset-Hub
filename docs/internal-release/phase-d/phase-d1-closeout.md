# Phase D.1 — Windows 资产兼容性与内部交付收敛

截至：2026-10-14。状态：**PARTIAL，隔离资产覆盖已实测，可供操作员审查；不是生产验收或部署授权。**

## Git 基线与提交

从 HTTPS 完整克隆脱敏远端 main，REST 与 `git ls-remote` 核验 SHA `7545f41b300c227d8627558c6402aa38133b224b`、Tree `7c747f4b5eccb386c759a4bee3172a63f3ac3d46` 与暂停时一致；无 `.git/shallow`，`git fsck --full --no-reflogs --connectivity-only` 通过。main 可达总计 98 commits，其中 first-parent 82；提示原阶段口述的“54 commits”计数未与当前对象图吻合，但本轮只以核实过的 main SHA/Tree 为准。新分支 `codex/phase-d1-asset-compatibility`。

D1 Haldur 环境透传修复和本轮文档将组成新本地 Commit。当前 Windows 新 ZIP 尚未完成；Commit SHA/Tree/Parent 及 ZIP 身份在构建完成后补记。禁止 Push。

原 C2 源码 Commit `[restricted historical C2 source identity]`、Tree `7c747f4b5eccb386c759a4bee3172a63f3ac3d46`、ZIP SHA-256 `65f2af222d33090c3daef3e4d8fbe2542fbc4e13ab8496dcbc5cc002965d3475` 保持独立，D1 的既有 Windows 资产证据仍只对应该原发行版。新代码不得宣称复用了原 ZIP 作为新 Build Commit。

## 结果

- D1 合成 Knowledge MCP search→get、组件、字体、培训媒体上传/关联/Range、两套 DATA/媒体路径隔离和持久性均通过；跨 Windows 账户 ACL 拒绝未实测。
- 已修复 Hub 子进程未透传 Haldur 两个 root 的问题；8 项 Agent boundary/Haldur 定向回归 PASS。需要新 Commit 对应的新 Windows ZIP 与 Haldur HTTP 复验后，方能关闭该项。
- 真实候选 DATA/媒体只做只读映射；服务角色、真实 Haldur root、真实独立 Agent/Hub roots 和服务账户对真实根的有效权限仍 UNKNOWN/未验证。
- D1 实例通过受认证 shutdown 收敛；旧 V1 因原控制台不可达仍需操作员 graceful stop。
- 没有修改正式服务、生产 DATA、证书、真实资产或原 C2 ZIP；没有部署。

## 最小剩余工作

1. 完成本分支文档复核和一次本地 Commit，导出精确 Commit/Tree bundle 与 source identity；Windows 新建唯一 BuildRoot/OutputDirectory 构建新 ZIP，校验 SHA/manifest。
2. 将新 ZIP 安装到新的 D1 隔离 release，复用原 D1 合成 roots（先确认仍只含合成数据），验证 Haldur snapshot、SKILL 树、Markdown 更新与 ZIP 下载；完成后用受认证 shutdown 停止并核验锁/进程/端口。原 D1 C2 release 证据保留。
3. 由操作员回答唯一核心服务问题：`protected Windows service` 实际承载什么业务、谁拥有其入口/停机/切换权？由资产负责人提供目标版真实 DATA、培训媒体、Agent/Hub Runtime、Haldur source/runtime 的绝对根与服务账户。
4. 旧 V1 原控制台由 test account 操作员执行其原生 graceful stop。真实根 ACL/备份恢复/历史媒体引用另作授权评估；正式切换需独立审批。
