# V2.5.4 验证记录

2026-11-03，基于远端正式 main `d1b686b6125b18203a6e87c8cc5a8975125c5ba2` 的独立源码副本，仅加入本版本19个源码、测试及说明文件。原工作区的其他未提交改动、Windows专用运行补丁均未纳入。依赖从未修改的锁文件执行 `npm ci --no-audit --no-fund`。

环境：macOS、Node24.15.0、Next15.5.27。此处是源码发布验证，不是Windows原生运行验收。

| 检查 | 结果 | 范围 |
| --- | --- | --- |
| 完整 TypeScript 检查 | PASS | `tsc --noEmit --incremental false` |
| Next生产构建 | PASS | 独立目录生产编译、类型检查、静态页面及依赖追踪 |
| 原生模型配置 | PASS | 提供方、模型目录、默认兼容、凭据引用与访客会话模型选择；访客配置和密钥操作拒绝 |
| 原生设置代理 | PASS | 固定上游客户端bundle、管理员持久作用域、访客原作用域、过期会话、缓存隔离及访客写拒绝 |
| Runtime生命周期 | PASS | 每次启动完整校验、状态实时健康、路径错误及其他环境默认行为 |
| 上传路径选择 | PASS | 去掉最外层目录、混合文件/文件夹、中文嵌套、同名不同目录、101项分批读取、不可读目录和非法路径 |
| 文件与目录事务 | PASS | 上传、显式覆盖、移动、回收、下载、元数据回滚、修订冲突、磁盘限制、锁及恢复 |
| 工作台集成回归 | PASS | 现有导航、动态API、冲突和恢复契约 |
| 实际Next读取接口 | PASS | 合成隔离资料；管理员取得统一回收路径，管理员请求前后的访客均不获得路径，响应private/no-store；临时服务已关闭 |
| 提交范围检查 | PASS | 仅允许清单文件；排除真实凭据、内部服务器地址、资料、ZIP及运行缓存 |

主要回归命令：

```sh
node scripts/verify-native-model-settings.mjs
node scripts/verify-native-settings-proxy.mjs <固定上游ui-settings客户端文件>
node scripts/verify-runtime-status-fast-path.mjs
node --experimental-strip-types scripts/verify-haldur-upload-selection.mts
npx tsx scripts/verify-haldur-design-skill-files.ts
npx tsx scripts/verify-haldur-design-skill-directories.ts
npx tsx scripts/verify-haldur-design-skill-workbench.ts
```

未执行本源码标签的Windows重新构建、服务器切换、整机重启或生产回滚。历史部署包验收与本版本源码验证分别记录，不把历史验收当作本标签的全量运行验收。
