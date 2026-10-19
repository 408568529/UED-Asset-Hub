# V2.5 固定运行依赖

| 组件 | Windows x64 | macOS arm64 |
|---|---|---|
| Node | 22.23.2 官方 ZIP | 22.23.2 官方 tar.gz |
| Git | MinGit 2.53.0.windows.2 | 2.53.0 上游源码原生构建，本地验证用途 |
| DSH | b150a551b8d465e31e418e1b2eaf5e79bbb7d28e | 同一固定源码，独立原生构建 |
| GenUI | 0.15.1 官方 tgz，官方 Plugin Manager 安装 | 同一固定 tgz，独立安装与构建 |
| pnpm/npm | 11.7.0 / 10.9.8 维护者构建 | 同版本维护者构建 |

精确下载地址和 SHA-256 见 service/windows/competition-tools.json 与 service/macos/competition-tools.json；准备回执记录实际原生工具和来源。保留 DSH 官方 Git authority、依赖来源验证和许可；不将开发机个人配置、凭据或会话复制到程序包。成品缺任一组件时检测失败，不要求普通用户补装开发工具链。Windows 文件符号链接权限仍是已声明运行前提，干净普通账户验收未完成。
