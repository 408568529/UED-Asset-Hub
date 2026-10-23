# 3047 持久化演示启动验收（2026-10-19）

用户授权后，已启动上一阶段的恢复候选，并正常停止、重新启动本轮拥有的 Supervisor 一次。最终保留 3047 运行，浏览器打开原 MES 退料单设计成果。未 Push、未部署或操作 Windows 稳定实例。

## 实际验收

| 项目 | 结果 | 证据/实际行为 |
| --- | --- | --- |
| 持久化配置加载 | PASS | Hub DATA=`runtime/hub-data`；DSH_HOME 及其他有效 Runtime 路径不变；日志依次出现 Gateway、DSH、Proxy、health-check、ready |
| 历史会话 | PASS | 工作台列出原 9 个会话；代表性打开 Knowledge MCP/GenUI、合成参数、按原型设计会话。重启后 9 份原生压缩日志均完整解析，事件行数不低于恢复前 |
| 原 GenUI 打开 | PASS | 游客计数面板、V15 参数面板、MES 退料单列表均渲染成功 |
| 交互/保存/刷新恢复 | PASS | 原游客面板 count=2；加一保存至 3，普通刷新恢复 3；随后减一保存回原值 2，保留 marker |
| 参数与草稿保留 | PASS | 原 V15 已保存 `fieldGap=47,rowHeight=38,compact=true,marker=v15-synthetic`；原草稿 `fieldGap=51`，未强制覆盖成 47。完整进程重启后仍一致 |
| 真实 Agent 读回 | PASS | 在原合成参数会话追加一轮只读验收；原生日志确认实际调用 `genui_state_read`，模型正确区分 47 保存值与 51 草稿 |
| 真实 Knowledge MCP | PASS | 同轮真实 `search_knowledge` / `get_knowledge_asset`；返回合成规范正文 19px/27px 和准确 `asset-hub://knowledge/micro-spec/micro-spec_ed04a3ba186a4642b1ebc378bef53e75` 引用 |
| 正常停机再启动 | PASS | 先验证 PID 8462 的命令/cwd 确属本轮候选，再 SIGINT；原 5 个端口全部释放后，以显式最小环境重新启动。GenUI 47 文件重启前后哈希一致 |
| Finder 启动环境 | PASS | 新 `.command` 语法检查与 `env -i` 最小 PATH 下 `--check` 通过；显式补充 `/usr/local/bin`、Homebrew、系统路径，避免 Finder 缺 Node/npm |
| 原资产保护 | PASS | 原 `runtime/data`、Haldur 187 文件、媒体 2 文件均与初始哈希一致；没有初始化空 DATA |
| 实际 Mac 系统重启 | NOT_VERIFIED | 本轮没有重启操作系统；验证的是正常全链路停机后，以不继承 DATA/登录变量的环境启动 |
| Windows 正式运行验证 | NOT_VERIFIED | 未部署或连接 Windows；代码/配置边界只读确认，不能替代今后 Windows 实机验收 |

只有原合成参数会话追加了本轮只读验收及正常停机记录。GenUI 仅游客计数成果的 `artifact.json` 状态/交互结果元信息因保存测试发生变化，最终 count 已回到 2；应用源码和版本未重建。没有覆盖原始会话或其他成果。

## 日后启动

运行目录：`/Users/zhouzhijun/Documents/UED Asset Hub Visual Refresh/runtime`。

Mac 重启后，双击该目录的 **`启动3047演示.command`**。这不是系统登录自动启动项，不需要另行初始化 DSH 或输入模型 Key。

启动顺序：

1. 检查 3047 是否已经启动，避免重复拉起。
2. 从 `config/host-recovered-3047.json` 与受保护 `config/visual-login.json` 加载配置。
3. 使用现有 Host Supervisor，加载 `hub-data`，启动 Gateway、DSH、Proxy、Hub。
4. 使用原 `agent-runtime/dsh-home` 恢复会话、GenUI 和既有模型设置。
5. 等待工作台就绪，打开 `http://127.0.0.1:3047/agent`。

不依赖临时 DATA、临时登录文件或终端事先 export 的变量；`/private/tmp` 仅是系统临时工作位置。当前应用构建仍在持久化 `runtime/recovery-validation/workspace`，它现在是演示启动依赖，**不可作为测试垃圾清理**。日志为 `runtime/recovered-3047.log`。

若 DATA 或受保护登录配置缺失，启动器应报错，不能自动创建空平台。凭据保持本地 0600，不进入 Git 或本报告。非敏感启动器源示例见 `docs/mac-demo-launcher.command.example`；该示例供复制到运行目录后使用。

## Windows 边界

Mac 持久化 HTTP 例外同时要求 `process.platform === "darwin"`、显式启用、回环绑定、匹配的 Origin/端口及指定 DATA 子目录，Windows 不能启用该例外。

`src/config/storage.ts` 仍优先读取 `process.env.DATA_DIR`。Windows 的 `scripts/start-internal-release.ps1` 仍从其受保护运行配置读取原有 `DATA_DIR`、`TRAINING_MEDIA_DIR`、`AGENT_RUNTIME_DIR`、`DSH_SOURCE_DIR`、`DSH_RUNTIME_SOURCE_DIR` 等路径，没有引入 Mac 路径作为默认值。其现有允许列表不接受 Mac 专用 opt-in 字段。本轮没有修改 Windows 启动脚本、DATA 映射、凭据或服务。

未来 Windows 发布时继续使用该实例自己的原有运行配置，不能把 `runtime/config/host-recovered-3047.json` 或 Mac DATA 打包替换 Windows 数据目录。本轮未进行 Windows 部署。

## 证据

证据根目录：`/Users/zhouzhijun/.codex/visualizations/2026/10/15/01a13dd9-7d6b-7351-a5f5-2b8bdeed1d96/persistent-recovery-20261019/`。

- `3047-real-agent-readback.txt/.jpg`：真实模型读回、参数草稿区分与规范引用。
- `3047-after-restart.txt/.jpg`：全链路重启后恢复参数。
- `3047-design-demo.txt/.jpg`：原 MES 设计成果实际打开。
- `restart-before.json` / `restart-invocation.json`：重启前哈希和明确的本轮进程归属。
- `activation-session-integrity.json`：9 份原生会话帧与行数、本轮实际工具调用。
- `activation-results.json`：原资产保护、47 个成果文件保留、重启前后 GenUI 哈希一致。

旧恢复候选阶段的 NOT_VERIFIED 状态见前一报告；上表是启动授权后的补充结果，不将历史聊天答案当作本轮模型验收证据。
