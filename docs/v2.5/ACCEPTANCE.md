# V2.5 首轮验收与阻断

日期：2026-10-19。本轮仅隔离开发、文档、合成目录测试和本地提交；没有Windows构建、真实Key或新机实测。

| 门禁 | 状态 | 本轮证据与剩余项 |
|---|---|---|
| 干净提交基线、独立分支 | PASS | de63f916/42966b0e起点；独立clone，无共享对象硬链接；原HEAD/index/status未变 |
| 52原则交付来源 | PARTIAL | 原工作区十四份改动哈希未变；未提交/未纳入新分支；等待用户选择 |
| 发行脚本依赖闭包 | PASS | 修复补丁字符串误报，实际源码闭包及回归测试通过；AST分析在prune之前执行 |
| 成品无需TypeScript | PASS | 在无node_modules临时目录复制独立校验器验证manifest成功；不要求普通用户安装编译工具 |
| DSH Git身份契约 | PASS | 既有G036合成离线验证通过，12个语义链接用例；不是Windows实机烟测 |
| GenUI/Haldur补丁 | PASS | 仅对随仓库官方tgz的index.js与可丢弃profile测试；原始限额复现、顺序/分页、篡改拒绝与幂等通过 |
| 包内容/架构/哈希/许可 | NOT_VERIFIED | GenUI tgz本轮哈希匹配；完整Windows运行依赖/工具/许可仍缺，未生成ZIP |
| 中文双击首装、目录、管理员初始化 | NOT_VERIFIED | 入口/向导待实现；中文/空格/普通权限/取消恢复无实机证据 |
| 再次启动、同实例、冲突与停止 | NOT_VERIFIED | 现成shutdown client只支持Service；交互受控停止需接入现有生命周期 |
| 凭据安全 | PARTIAL | schema测试通过；当前helper本机范围、默认YAML明文链路已定位；安全方案待批准，不能报加密PASS |
| 功能烟测 | NOT_VERIFIED | 未启动V2.5完整栈，未调用模型或使用真实资产 |
| 原版本保护 | PASS | 原视觉工作区HEAD/status/十四份文件哈希、3047监听PID不变；未访问Windows，无生产/旧包变更操作 |
| 文档 | PARTIAL | 四步README.md及同源HTML、依赖矩阵、方案与门禁已形成；因向导待实现还不是用户可照做的最终安装说明 |

## 具体代码修复

已有Internal Release使用正则分析import，会把GenUI/Haldur补丁生成字符串里的 `./ued-haldur-reading-policy.mjs` 误判成源码依赖，阻断当前提交打包。改为使用项目现有TypeScript AST，仅在构建分析函数内延迟导入；保持真实依赖缺失、路径越界、符号链接与manifest校验约束。新增覆盖补丁字符串/注释、side-effect import、re-export、动态import、缺依赖及无TypeScript独立校验回归。构建脚本先分析再prune，不把分析器加入成品运行要求。锁文件未修改。

## 当前必须解决的阻断

1. 用户确认52原则是否纳入V2.5新分支；原工作区保留原状。
2. 用户确认凭据加密范围与Web保存/替换/删除的完整方案，见CREDENTIALS-DECISION.md。未获确认前不实施此安全决定。
3. 锁定并准备Windows Node/Git/Corepack及DSH/GenUI完整构件；收紧Node范围并核对Service固定版本冲突；落实再分发许可与原生依赖闭包。
4. 获得明确授权的独立Windows x64构建及干净普通用户测试环境。当前没有通过验收的可用新机；不得使用旧Windows正式服务或DATA代替。

## 真正新机验收的最小环境与步骤

使用合法干净Windows x64 VM/机器及新测试账户；不得删除现用电脑缓存模拟新机。构建目录与用户DATA全新独立，记录OS、架构、账户权限和最终Commit/Tree/包哈希。

1. 验包、解压到中文/含空格目录，双击“轻点击我启动”；不手工安装Node/Git/VS或运行开发命令。依赖缺失必须可理解地失败，联网目标符合声明。
2. 选新总目录并取消一次、重试确认；检查非法路径/链接/权限/空间/重名/已有DATA拒绝覆盖。注入一次中断检查旧文件保留和可恢复阶段。
3. 使用合成管理员/假Key完成加密链路与磁盘扫描，确认只存在密文；错误账户、损坏密文、Key更换/删除和无Key回退均失败关闭。真实Key只由用户本人另行配置。
4. 验证知识/Haldur、真实SKILL.md读取、GenUI保存/刷新；有获准Key时由用户完成真实Agent调用。检查鉴权和权限边界。
5. 重复双击只打开原实例；占用端口不杀其他进程；受控停止确认所有本实例子进程退出；再次启动及系统重启后无重复安装、Key输入，原数据/状态仍在。
6. 验证非覆盖式升级保留原分散配置，回滚仅切程序；单独记录数据兼容边界。无完整实测保持NEW_MACHINE_NOT_VERIFIED。

## 回退

本轮只在独立V2.5仓库写文件；原工作区、3047、Windows和DATA不需回退。代码修复可在新分支审查后用git revert对应本地提交撤销；不要在原视觉工作区reset/clean/stash。未实施任何回退或数据迁移。

测试原始状态和初次命令问题及纠正见verification-evidence.json。首次缺依赖/漏参数不是产品运行结果；已用正确条件重跑。PowerShell原生执行与最终Windows构建仍未验证。
