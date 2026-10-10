# UED Asset Hub 内部生产切换与回滚计划

状态：只读准备稿。未授权、未执行生产切换。

## 观察到的生产边界

- Windows Service：`UEDAssetHubR2C`，当前为 `Running` / 自动启动。
- Service wrapper：`D:\UED-Asset-Hub-Staging\staging\block-g-r2d-20260915-163500\service\UEDAssetHubR2C.exe`。
- 观察到的 Hub Runtime：Node `22.23.2`，监听 TCP/3000；运行脚本位于该实例 `app` 下。Service root 不同于本轮 staging root。
- Service 配置中的运行数据路径：
  - `DATA_DIR=D:\UED-Asset-Hub-Staging\staging\block-g-r2d-20260915-163500\runtime-data\data`
  - `AGENT_RUNTIME_DIR=D:\UED-Asset-Hub-Staging\staging\block-g-r2d-20260915-163500\runtime-data\agent-runtime`
  - `ASSET_HUB_RUNTIME_DIR=D:\UED-Asset-Hub-Staging\staging\block-g-r2d-20260915-163500\runtime-data\asset-hub-runtime`
  - `TRAINING_MEDIA_DIR=D:\UED-Asset-Hub-Staging\staging\block-g-r2d-20260915-163500\runtime-data\training-media`
- 以上四个运行数据目录的 ACL 均包含 `NT SERVICE\UEDAssetHubR2C:Modify`，SYSTEM 和 Administrators 有 FullControl。代码、上传与数据库均不得覆盖这些目录。
- Service XML 未声明 `HALDUR_DESIGN_SKILL_ROOT` 或 `HALDUR_DESIGN_SKILL_RUNTIME_ROOT`。Skill 的有效来源与实际字体/视频引用应在未来切换窗口以只读方式再确认。
- 正式 TLS 终止点、证书路径及反向代理配置不属于本轮 staging；本轮不读取私钥、不更改正式 HTTPS。切换前须只读确认现有入口仍转发至既有 3000 服务。

## 构建与候选来源

1. 以本轮本地 Commit 为源码来源；记录 Commit、Tree、Parent SHA。构建应在 Windows x64 staging 构建目录内，使用仓库 lockfile 和受支持的 Node 22 工具链，执行 `npm ci`、`npm run build` 及受影响的定向回归。
2. 核对构建产物、standalone server、静态资源与路由清单；不得从 macOS 直接复制含平台原生依赖的 `node_modules` 到 Windows。
3. 正式切换前由独立授权明确批准候选 Commit、构建散列、窗口、停机预算及回滚责任人。本准备稿本身不是部署授权。

## 数据、资产与权限保护

1. 在维护窗口前建立全新的只读备份目标；不得复用或覆盖历史备份。先记录各目录的完整路径、ACL、文件数量、总字节数与逐文件 SHA-256 清单。
2. 备份整个 `runtime-data` 下的 `data`、`agent-runtime`、`asset-hub-runtime`、`training-media`，以及实际发现的 uploads、字体、Skill 和视频根。保留 NTFS ACL、所有者、时间戳；包含数据库 WAL/SHM 文件。数据库若支持一致性快照，依其既有维护程序执行；不要在本计划中新增迁移或修复。
3. 备份后核对必需数据库与资产文件均存在，复算清单散列，并检查排除清单不包含运行数据。恢复演练须在隔离目录完成，不覆盖原备份或正式数据。
4. 本轮没有数据结构变化。未来候选若引入 schema 变化，须另行给出旧版兼容读取、新结构迁移、备份恢复和降级策略；未经单独授权不执行迁移。

## 切换与验收步骤

1. 记录正式服务当前版本、Commit/构建散列、Service 配置、监听地址/端口、TLS 转发目标和所有运行数据路径。
2. 先将候选构建完整复制到独立的 `current.next`，核对文件散列、权限、必需静态资源和运行时闭包。正式 `current` 与四个运行数据目录此时保持不变。
3. 确认备份通过后，在授权窗口优雅停止 `UEDAssetHubR2C`，核对服务状态、进程归属和 3000 端口释放。不得停止本轮 staging 的 4443 入口来代替生产停机。
4. 原子切换代码目录为候选版，保持 DATA、Agent Runtime、Hub Runtime、媒体、上传、Skill、字体、视频及证书路径原样；只调整经单独批准的代码指针/服务配置。
5. 启动原有 Service 身份和既有 HTTPS 入口，验证服务账户可读取代码并按原 ACL 写入运行数据；检查登录、关键 Hub 页面、上传/静态媒体、Agent Runtime、Knowledge/MCP（若正式启用）及只读诊断。
6. 验收成功后保留旧代码目录和本次备份至约定保留期结束；不删除历史版本或证据。

## 回滚步骤与影响

1. 若 Service 未按预算启动、HTTPS/登录失败、关键页面异常、数据写入或权限偏离基线，立即停止后续发布步骤并记录首个失败。
2. 优雅停止候选 Service，核对 PID 与端口属于正式服务；将代码指针恢复至已记录的旧目录/Commit，并按原 Service 配置启动。
3. 数据未迁移时保持 DATA 与资产目录不变；若未来经单独批准执行了迁移，先依该迁移专属恢复演练操作备份，不在本流程内猜测降级方式。
4. 验证旧版登录、3000 监听、原 HTTPS 入口和数据目录可读写状态；保存回滚前后服务/端口/散列证据。
5. 预计维护影响为一次 Hub 服务重启；停机预算由未来审批窗口决定。本轮未测量正式环境的实际切换耗时。

## 本轮界限

当前正式 Service 仅作只读盘点，状态保持原样。本轮未执行备份、停止、重启、数据迁移、TLS 更新或代码切换。正式部署必须由用户另行明确授权。
