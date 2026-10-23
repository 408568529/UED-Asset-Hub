# UED Asset Hub V2.5.2：微规范独立模块与迁移

`/micro-standards` 独立管理 Markdown，复用 Knowledge 的阅读器、编辑器、主题与 Ant 组件。访客阅读、搜索、下载；管理员创建、上传、编辑、移动主题及管理文件夹。非空主题不能删除。旧 `/knowledge?asset=micro-spec:<id>`、旧创建/编辑入口兼容跳转；Knowledge 列表不再作为微规范管理入口。全局搜索/MCP继续收录，每个ID仅一份权威来源。

## 路径契约

- `MICRO_STANDARD_ROOT` 显式指定绝对路径；无配置的老安装保留旧数据读取，不自动切换。
- 全新、确认过的 V2.5 资产根由现有初始化器创建 `micro-standards/`，配置指向该目录。已有目录拒绝重初始化；丢失根/索引直接报错。
- Mac 示例：`<runtime>/micro-standards`，与原 `<runtime>/hub-data`、`Haldur-Design-Skill`、`agent-runtime`、媒体目录并列。
- Windows 示例：用户选择 `D:\UED-Assets` 后，得到 `D:\UED-Assets\micro-standards`、`hub-data` 等。已有Windows安装保留原DATA、DSH_HOME等全部绝对路径，仅显式新增微规范根，不把程序解压目录当资产目录。
- 每层真实主题文件夹存 `.md`，根的 `.micro-index.json` 以稳定ID关联完整元数据、相对路径、正文SHA-256。文件名为标题的跨平台安全名称加确定性ID摘要；标题元数据完整保留。主题与关联类目分别保存。
- 只通过管理API编辑；外部改动正文会触发哈希冲突，需人工核对，不自动覆盖。主题首期一层，保留名称、越界、NFC、大小写冲突、链接路径均受检查。
- Haldur路径及Skill ZIP导出不变，不同步/打包独立微规范；新根也不传给DSH/Proxy，MCP只通过既有只读Gateway获取内容。

## 显式迁移与回退

维护者在本仓库已有 `tsx` 环境运行（不属于普通用户首次启动命令）：

1. `tsx scripts/migrate-micro-standards.ts dry-run <原DATA绝对路径> <新独立根绝对路径>`：盘点所有ID、完整metadata、哈希、来源/目标；异常与历史JSON候选须先核对，不静默跳过。
2. 合成演练和验证通过后，使用同参数的 `copy` 模式；它复制，不删除、移动或重写旧目录。已迁移且完全相同可重复执行，用户已更新的目标会阻断覆盖。部分失败保持候选，不自动切换。
3. 校验数量、正文与全部Metadata一致后，受控停止当前Hub，原运行配置仅新增 `MICRO_STANDARD_ROOT`；使用匹配的新程序启动。后续启动不再重跑迁移。
4. 引用键仍为 `asset-hub://knowledge/micro-spec/<原ID>`，UI链接为 `/micro-standards?asset=<原ID>`；旧知识库微规范被读取适配器过滤，不产生双真源。
5. 回退：受控停止新程序，移除本次新增的环境变量并使用原版本入口。旧DATA从未改变。切换后如发生真实编辑，先停止写入、逐项核对独立库变更；不要直接回退到旧正文而遗失新内容。本次原始切换清单与旧版本身份保存在验收报告，不复制会话/密钥。

单实例/多进程写入由独立根内互斥与事务日志串行化；内容和索引切换失败会恢复原记录，进程中断后的首次读取先恢复事务。读取不会为缺失根自动造空库。操作超时先刷新核对，不盲目重试。

## 首装、更新与备份范围

现有首次初始化确认机制继续负责资产根，新增目录为空，不填充样例或Key。已存在安装不静默新增配置或迁移。升级程序时保留所有业务绝对路径。

以后如用户明确要求备份/导出整套业务资产，应将独立 `MICRO_STANDARD_ROOT`（含主题Markdown与索引）列入范围；仅备份 `DATA_DIR` 已不足。此文档不执行备份。Markdown下载不包含其他资产、模型Key或会话。没有本轮Windows发行/部署或新ZIP。

## 验证命令

- `tsx scripts/verify-micro-standards.ts`：合成迁移、幂等、故障注入、进程中断恢复、目录安全与稳定ID。
- `tsx scripts/verify-micro-standard-gateway.ts`：单真源搜索/全文/引用、即时读回、主题变更、DSH权限边界。
- 原有 Knowledge Gateway、Haldur、V2.5 首次初始化定向回归。

真实模型按SKILL流程生成不属于本次验收；不得用HTTP/MCP通过替代真实模型PASS。Windows实际路径与UI运行本轮未验证。
