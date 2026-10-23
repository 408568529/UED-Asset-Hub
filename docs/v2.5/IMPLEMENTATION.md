# V2.5 执行边界与验证

用户已批准双平台完整运行包和显式本机 HTTP 发行模式；以 README 中现行范围为准。继续 codex/v2.5-competition-delivery，复用既有 Internal Release、Host Supervisor、受控停止和 DSH Plugin Manager。无 Push、合并或正式部署。原 Mac3047、Windows 现有服务和数据受保护。

1. 原生 Windows x64 构建并校验 Hub、便携工具、固定 DSH 和 GenUI，再组装 ZIP。新文件只在授权 D 盘隔离根目录。
2. 公共逻辑稳定后在原生 macOS arm64 构建同源 Hub、DSH 和插件；不复制运行中的 DSH_HOME。
3. 校验完整性、只读检测、全新管理员配置、本机绑定、Host/Origin、权限、重复启动、受控停止和复启持久化。新机、Finder/Explorer 真双击、真实模型调用分别记录；未验证项不得以合成测试替代。

安全决定：本轮不新增 DPAPI API Key 功能。API Key 由原 DSH 后台配置，原文件存储不能称为加密。本机发行模式必须显式且独立通过路径/来源/监听配置校验；Service/LAN/public 继续 HTTPS/Secure Cookie。定向测试覆盖该边界。
