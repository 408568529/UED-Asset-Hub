# V2.5 模型凭据范围（已按用户调整）

2026-10-19：取消新增DPAPI API Key适配、独立凭据管理/加密输入界面和跨账户适配。先前的方案A/B未实施，本次不再等待此项审批。不修改DSH核心、credentials-local、既有管理员设置页或现有鉴权机制。

使用者通过现有 `/admin/login` 登录，再进入 `/agent/settings`（悠鼎Agent的“模型设置”），输入自己的DeepSeek API Key，确认Base URL与模型后保存；可按需使用现有测试连接。Key不预置于ZIP、Git、README或启动参数，不由启动器接收或记录。

默认DSH credentials-local写到 `<AGENT_RUNTIME_DIR>/dsh-home/.credentials.yaml`。这是依靠文件权限/账户访问控制保护的本地凭据存储，不是本轮提供的加密存储；password输入框和掩码仅用于减少屏幕暴露，不代表磁盘加密。保留现有权限，不降低鉴权，不额外备份、迁移或复制作者凭据。

后续启动使用同一个外置AGENT_RUNTIME_DIR/DSH_HOME，保留文件配置，因而不要求重复输入Key。磁盘丢失、权限不足或文件损坏时报错，不创建空配置替代。继承的DEEPSEEK_API_KEY在上游优先级高于文件并为只读；本次双击入口隔离此变量，避免后台设置被其他来源遮蔽，不输出其值。

本轮只使用合成凭据做必要测试；不读取既有实例的Key、Cookie或密码。本机发行模式已获用户明确授权：显式启用、严格回环绑定、首次管理员配置、保留 HttpOnly/SameSite、Host/Origin 和原 GenUI 签名资源授权；仅此已校验模式允许 HTTP / 非 Secure Cookie。局域网共享和 Windows Service 继续原 HTTPS / Secure Cookie、管理员与 Agent Proxy 机制；不自动签发证书，不将本机模式作为共享部署开关。
