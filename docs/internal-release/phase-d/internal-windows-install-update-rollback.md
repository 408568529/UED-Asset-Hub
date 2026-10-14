# Windows 内部发行版安装、升级与回滚 Runbook

本 Runbook 用于新的隔离内测安装，不是生产变更授权。真实服务 `protected Windows service` 的业务角色仍 UNKNOWN。

## 适用条件与身份

- 新建唯一 InstallRoot、外部配置、DATA、培训媒体、Agent/Hub Runtime、DSH source/runtime、Haldur source/runtime 根；使用绝对路径并确保互不重叠。
- 选择未占用的端口；避开受保护服务和其他隔离实例的端口；具体端口表仅保存在受限运维记录。
- Mac 只从脱敏 GitHub main 的完整 Git 基线提交构建/导出 inputs。Windows 核验 Commit、Tree、ZIP SHA-256 和 manifest；Tree 相同不能代替 Commit 身份。
- D1 修复后的 Windows ZIP 应对应新 Commit。旧 C2 ZIP 只对应 `[restricted historical C2 source identity]`，ZIP SHA `65f2af222d33090c3daef3e4d8fbe2542fbc4e13ab8496dcbc5cc002965d3475`，不能重标为新构建。

## 安装与启动

在 release 和 DATA 之外设置受限 PSD1 配置；Secrets 不放在该文件中。按脚本契约依次执行：

```powershell
./tools/install-internal-release.ps1 -ZipPath $zip -ExpectedSha256 $sha -InstallRoot $install -ConfigPath $config
$release = Join-Path $install 'releases/<version>-<commit>'
& "$release\scripts\install-internal-dsh-runtime.ps1" -ReleaseRoot $release -ConfigPath $config
./tools/activate-internal-release.ps1 -InstallRoot $install -ReleaseVersion '<version>' -ConfigPath $config
./tools/status-internal-release.ps1 -InstallRoot $install
./tools/start-current-internal-release.ps1 -InstallRoot $install -ConfigPath $config
```

先在新隔离根验证运行用户写入/读取、端口所有权、登录、Hub、Agent/Gateway/DSH、Knowledge MCP、媒体与 Haldur，再用该实例受支持的 graceful shutdown 验证组件退出、Job/Helper/lock/端口释放。

## 升级与回滚

升级先停止该隔离实例。新版本用新的 Commit、Tree、构建输出和 release 目录，不覆盖旧目录。激活前确认 DATA、媒体、Haldur、Agent/Hub Runtime 仍指向已经批准的**隔离合成根**。需要 schema 迁移时停止，不做原地转换。

回滚只切换已记录的 release 指针并恢复代码版本；外置 DATA、媒体、Haldur、Agent Runtime 不随 ZIP 回滚或重新上传。数据恢复只能走单独核准并演练过的流程。同卷备份不等于独立介质容灾。

## 操作员切换清单

确认当前服务业务角色与所有人、准确 DATA/媒体/Agent/Hub/Haldur 绝对根、运行账户和最小 ACL、模型 Key 受保护录入、TLS/端口、版本身份、健康验收、日志位置、备份恢复点、维护窗口、回滚负责人。旧 V1 安全停止由原控制台操作员完成。取得单独部署授权前不得更改正式服务或入口。

## Phase D.1 Haldur 发行验收增补

`HALDUR_DESIGN_SKILL_ROOT` 和 `HALDUR_DESIGN_SKILL_RUNTIME_ROOT` 必须由受限运行配置传入 Asset Hub Hub 子进程；它们不得因此传给 DSH、Gateway 或 Agent Proxy。本轮修复与边界断言已通过 8 项定向回归。下次 Windows 内测应使用该修复新 Commit 构建的新 ZIP，检查 Haldur 目录快照、合成 Markdown 更新、文件上传及 ZIP 导出，然后用 D1 实例受认证 shutdown 验证 lock、Job、Helper、进程与端口收敛。不得对真实 Haldur 根做写测试。
