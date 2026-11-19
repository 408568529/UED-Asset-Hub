# Skill 与 HTML 原型交付

Harness 原生 `skill` 目录和加载器负责发现/加载 Haldur Skill。Hub 作为只读资料提供方，每次加载读取当前完整入口正文；引用的 Markdown、CSS/SCSS、HTML、JS 等文本继续按需搜索和分页读取。没有额外的每轮 Haldur 调用次数上限、固定搜索顺序或模板白名单。原始资料保持只读；不开放任意服务器目录、Shell 或密钥文件。

## 自主创作

Agent 根据提示词、截图及适用 Skill 自行选择 HTML 或 GenUI。GenUI 保留。

- `html_templates` 动态发现当前 HTML/HTM；新增/改名模板下次检索自动出现。
- `html_from_template` 复制所选模板及运行资源；`resource_paths` 可补充动态引用。
- `html_create` 可直接编写新的 HTML 原型。
- `html_inspect` 查看摘要或局部正文。重复锚点返回候选位置，`occurrence` 可选择某次出现。
- `html_find` 返回文字匹配的上下文、行号、UTF-16 offset 和文件哈希，避免猜测大文件偏移。
- `html_patch` 做精确局部修改；重复文字可用 `offset` 和同一 SHA-256 定位。
- `html_write` 在会话成果内新增或完整编写 HTML/CSS/JS/JSON/文本文件，覆盖须提供原文件哈希。无需把生成限制成修改模板配置。

文件保存只返回 `saved`，不代表已完成。版本不可变；失败、过期或并发修改保留上一版。旧成果继续可打开，新成果不会写回 Skill。

## 运行和交互检查

`html_check` 使用现有 Edge/Chrome 的独立临时浏览器，检查真实脚本异常、失败资源以及任务要求的 DOM 操作和结果。它通过私有管道通信，不监听调试 TCP 端口；浏览器不复用用户配置、登录或 Cookie，网络仅能读取当前成果版本的资源。退出后清理自身浏览器及临时配置。

Agent 应从用户需求/截图/Skill 提取关键验收项，列出尚未实现的需求，并提交声明式步骤和断言。例如：输入筛选后结果变化、重置恢复、新建打开实际界面、选择器能选择并回填、确认后状态更新。仅点击按钮、占位提示或看到标题不能证明业务完成。

参数 `intent` 为 `interactive` 或用户明确要求的 `static`。每项包含 `name`、`steps` 和 `expect`；操作支持 click/fill/select/press/check，断言支持 visible/hidden/text/value/count/attribute/checked/url。所有选择器和字段都是数据，不接受任意 JavaScript 或服务器命令。结果返回运行错误、失败资源、可见控件和逐项检查结果，以供修复后重试。

`html_present` 要求同一精确版本的检查已通过且无未实现需求，否则拒绝完成交付。新版本必须重新检查；旧版报告不能用于新版。历史卡片没有报告时明确显示尚未验证，不删除旧成果。

自动检查只证明实际执行的运行/交互用例，不等于完整的业务语义、像素还原度或真实后端联调。Agent 必须如实覆盖任务要求，不得用几项简单检查隐瞒未实现部分。

## 存储、限额与运维

成果位于现有 Agent Runtime 的 `dsh-home/html-artifacts`。检查记录和截图在独立 `_checks` 中，不进入下载 ZIP。单文件4MiB、总资源16MiB，含启动文件最多48文件；Skill 读取保留目录边界、单文件大小与续读哈希。浏览器工具每次最多16项检查、每项20步，单次检查有执行超时，防止遗留进程。

预览使用无同源权限的 sandbox，链接限定成果和版本并在30分钟后失效；卡片刷新可重新申请。ZIP 含 HTML、运行资源和校验清单，不含凭据或服务器实际根路径。特殊外部运行依赖仍需明确处理；不会通过任意网络抓取或执行模板中的命令绕过边界。

升级沿用独立 Release、active-release 指针和 LocalService。程序回滚保留业务资料及会话成果，旧程序功能可能不同。安装目录与 ZIP 继续只对授权管理账户可见。

验证：

- `node scripts/verify-html-artifacts.mjs [archiver入口]`
- `node scripts/verify-native-haldur-skill.mjs`
- `node scripts/verify-html-browser-check.mjs`（需系统 Edge/Chrome）
- `npx tsx scripts/verify-haldur-knowledge.ts`
- Windows LocalService、真实模板回归和原生 Skill 生成会话验证。
