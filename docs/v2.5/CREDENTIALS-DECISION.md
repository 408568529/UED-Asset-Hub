# V2.5 凭据适配决策单（待确认）

## 当前证据

1. Hub `src/lib/dshModelSettings.ts` 的 saveModelSettings 调用 `credentials.set`；API 虽有管理员鉴权，默认 DSH credentials-local 仍将值写到 DSH_HOME/.credentials.yaml。
2. 已锁定官方 DSH Commit 的 credentials-local 源码规定：继承环境 > 托管 YAML > cwd/.env > DSH_HOME/.env。继承环境源为只读，set/unset 会拒绝，故已有环境注入机制可复用；文件 ACL/0600 不构成加密。
3. `native/windows-dpapi-credential-helper/ued_windows_dpapi_credential_helper.cpp` 的 CryptProtectData 明确使用 CRYPTPROTECT_LOCAL_MACHINE。它依赖文件 ACL 限制可读取密文者；不能描述为账户范围加密。
4. `scripts/host-supervisor.mjs` 当前只在 Windows Service + production 分支解密 bundle；交互双击路径尚未接通。bundle schema 已有可选 deepseekApiKey，dsh 子进程环境白名单已有 DEEPSEEK_API_KEY；Hub/Proxy 不应获得该 Key。
5. 现有 helper 和 schema 测试不证明 Web 保存、实际 DPAPI、错误账户和磁盘明文残留已通过。未读取任何现用凭据。

## 推荐方案 A：当前用户范围 DPAPI（待用户批准）

- 比赛双击版以 Windows 登录账户运行；新增显式 user scope 到现有 helper，保持既有 machine 模式行为不变，避免破坏已有 Service 合约。加密范围和文件格式要明确绑定，不能静默降级。
- 管理员在受保护设置表单输入自己的 Key。服务端验证当前安装身份，使用既有 helper 的 stdin 管道把 bundle 直接加密为私有 config 内的密文；不通过参数、日志、浏览器回显或临时明文文件转交。
- 配置写入采取同目录密文临时文件、ACL 验证、解密/schema 验证、原子替换；失败保留旧密文。新增/更换/删除都要经过相同路径，不能继续调用 credentials.set/unset。
- Supervisor 在同一 Windows 用户下解密并按既有环境白名单只注入 DSH。由于上游环境源只读，DSH 自带模型页不能把相同 ref 写回明文。仍需检查其他凭据 RPC、记录接口及缺 Key 场景，不能只靠上游优先级推断安全。
- Key 更换/删除需要受控重启 DSH 的运行代次并更新配置状态；必须由现有生命周期执行，活跃会话受影响应明确提示，不热写另一份明文文件。删除后仍需阻止默认 YAML 回退写入；若现有官方 seam 无法完整禁写，则先给出最小受限适配并单独确认，不能声称方案已通过。
- 检测到现成 credentials YAML / dotenv 时只报告来源冲突并停止，不读取展示、不自动迁移、复制或清除作者/旧实例文件。干净初装与“沿用已有安装”分开验证。
- 不承诺跨 Windows 用户或 Service 身份读取。Service 继续保留原有受保护机制，后续在明确服务身份、ACL、非交互账户和验证环境后单独接入。

## 备选 B：现有本机 DPAPI + 严格 ACL（待用户批准）

可少改 helper，但 Windows 上任何获得密文读取权限的本机账户可能具备解密能力，因此严格 ACL、所有者、重解析点与文件替换验证是安全边界。它不等于任意 Service 都可用，也不自动解决 Hub 明文写入。跨身份访问仍须明确配置和验证，不能暗自复制凭据。

## 合成验收与门禁

仅在全新隔离目录用固定标记的假 Key 测试；在 argv、日志、配置、YAML、dotenv、GenUI state、证据文件和 ZIP 扫描该标记，不输出它。验证合法身份重启解密、错误身份拒绝、ACL 篡改、密文损坏、更新/删除失败、并发设置及 DSH 无明文回退。真实模型调用由用户在目标环境自己配置后另验。

当前结论：方案可行性为 PARTIAL；加密闭环为 NOT_VERIFIED。上述方案未实现，尚未作不可逆安全决定。用户 V2.5 Prompt 第0、5、8节要求此类设计先确认，现等待确认后继续实现。若不能彻底阻止上游明文写入，阻止最终交付和“加密 PASS”。
