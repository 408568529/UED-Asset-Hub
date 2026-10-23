# V2.5 构建资源与收尾

仅供维护者。保持当前独立分支；Windows x64 完成后再执行 macOS arm64 的高内存构建。每个平台的现有构建入口自动使用父级隔离构建根目录下的独占锁，同一根目录不会并行运行 Hub、DSH 和归档任务。不得改用另一个根目录绕开同一轮构建锁。Git 工具原生编译维持 `make -j2`。

`build-internal-windows-release.ps1`、`prepare-competition-dsh.ps1`、`package-competition-delivery.ps1` 和 `build-competition-macos.mjs` 复用 `competition-build-resources.mjs`。工作目录必须是隔离根目录的全新直接子目录。记录在 `.competition-build-resources/<UUID>.json`，包含目录所有权、命令子进程 PID、时间、状态、磁盘采样与日志路径。进程异常退出后保留锁，先检查记录和实际进程，不自动强杀或夺锁。构建失败保留源码、中间产物与日志。

缓存只复用当前隔离根目录内带所有权记录的 `cache-node-22.23.2`，同一时刻由构建锁独占，固定工具链最多一份。npm/pnpm 继续执行原有完整性校验。已验证 DSH/GenUI 准备结果可由原收据参数复用；仍被引用的原生依赖、插件源及 DSH_HOME 保留。不得遍历、轮换或删除用户共享 npm/pnpm/Git 缓存。新工具链采用新隔离根目录，旧根目录按其自己的交付门禁结束生命周期，不自动推断未知缓存的所有权。

## 交付门禁及自动收尾

最终 ZIP、SHA-256、独立版本 Manifest、依赖检查及验收报告必须先保存到不在待删除目录内的交付目录。验收报告可明确记录 `NOT_VERIFIED`，不能为触发清理而伪造通过。生成一个非敏感 JSON 门禁，格式：

```json
{
  "schemaVersion": 1,
  "files": [
    {"role":"zip","path":"绝对路径","sha256":"64位小写SHA256"},
    {"role":"sha256","path":"绝对路径","sha256":"64位小写SHA256"},
    {"role":"manifest","path":"绝对路径","sha256":"64位小写SHA256"},
    {"role":"dependencies","path":"绝对路径","sha256":"64位小写SHA256"},
    {"role":"acceptance","path":"绝对路径","sha256":"64位小写SHA256"}
  ],
  "protectedPaths": ["所有仍引用的程序目录和源码位置", "外置业务数据", "DSH_HOME及GenUI/Haldur目录"]
}
```

交付流程保存并验证门禁后，自动执行一次（以下为参数示意）：

```text
node scripts/competition-build-resources.mjs cleanup <本轮资源记录绝对路径> <交付门禁绝对路径>
```

收尾重新核对全部文件 SHA-256 和 ZIP 的 SHA 文件、原始所有权、路径祖先、进程占用及引用关系，只删除记录中的有限构建子目录。拒绝链接根目录，不遍历内部符号链接。外置 DATA、Haldur 和运行程序以绝对保护路径登记；出现 DSH_HOME、凭据或运行配置则额外保留该目标并记原因。源码中同名 API/组件及第三方包的数据文件不作为外置业务目录识别。程序验收解压目录若被数据配置引用，保留。旧 Release、回滚包、ZIP、报告、源输入及原服务目录不在删除白名单。

同目录生成 `<UUID>.json.cleanup.json`，保存删除/保留原因、逻辑字节、构建前磁盘余量、每2秒观测的峰值、清理前后磁盘余量、交付 ZIP 大小和实际卷可用空间变化。共享卷可用空间变化可能受其他程序影响，不能把逻辑字节或采样峰值描述成精确的物理释放量。历史未采样的构建前/峰值标记 `NOT_RECORDED`，不能回填估算数。

验证：`node scripts/verify-competition-build-resources.mjs`，分别在原生 Windows x64 与 macOS arm64 固定 Node 下执行。测试只在自己的独立临时目录内创建和删除合成夹具。
