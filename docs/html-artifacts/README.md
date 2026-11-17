# HTML 成果预览（首版）

为已有 Haldur 列表页模板提供与 GenUI 并行的交付通道。Skill 原件保持只读，不转换为 React，不连接真实业务接口。

## 工具链

1. `html_from_template`：复制固定的 `2、典型页面/列表页-preview.html`、相对 CSS/资源及镜像图标脚本到当前会话成果目录。
2. `html_inspect`：返回文件摘要、SHA-256 和稳定锚点；按 region、唯一文字或 offset 读取局部内容。
3. `html_patch`：携带当前版本和文件哈希，精确替换唯一文字；保存不可变新版本。失败、过期或并发冲突时保留上一版。
4. `html_present`：返回原生 HTML 卡片，支持刷新、全屏、新标签和完整 ZIP 下载。

成果位于现有 Agent Runtime 的 `dsh-home/html-artifacts`，独立于 Skill。历史卡片固定对应历史版本；打开时申请30分钟、限定成果版本的只读访问链接。链接持有人可在有效期内读取该成果，应按内部资料对待。卡片刷新可重新申请链接。

HTML 在无同源权限的 sandbox 中运行，允许本地脚本和交互。原模板相对目录结构保持不变。浏览器不会获得 Hub 登录存储或任意服务器文件读取能力。ZIP 含 `index.html`、原模板路径、运行资源和校验清单，不含凭据或服务器实际根路径。

首版：每文件4MiB、总资源16MiB、最多48资源；局部读取最多16000字符，每次最多8项精确替换。只复制固定列表模板；图标 CDN 仅支持现有阿里 iconfont JS 并在复制时镜像，网络不可用时明确失败。说明文档链接不作为运行依赖复制。脚本语法检查不能代替浏览器效果检查。

## 验证

- `node scripts/verify-html-artifacts.mjs [archiver绝对入口路径]`
- `npx tsx scripts/verify-html-template-bundle.ts`
- `npx tsc --noEmit --incremental false`
- Windows 生产构建和真实模板卡片/ZIP 检查。

升级沿用现有独立 Release、active-release 指针和 LocalService。回滚切回上一程序 Release，保留全部业务资料和新增会话成果；旧程序不呈现新 HTML 卡片，但不应删除成果。
