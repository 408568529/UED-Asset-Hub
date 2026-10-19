# 3047 全量 UI 走查与视觉同步（2026-10-19）

以已确认的 Knowledge Library 为基准；保持首页与 Agent 深色风格。核对 59 个页面路由模式，75 个桌面访问记录，10 个手机代表入口及 5 个平板入口。路由模式结果：{'PASS': 52, 'PARTIAL': 7}。PASS 表示本轮视觉/入口检查通过，不等同于全部业务操作验收。

## 修复的共性问题

| 严重程度 | 问题 | 修复 |
| --- | --- | --- |
| 高 | 管理日志、版本、设置、诊断、测试环境等遗漏主题范围，切换后出现旧 UI | 统一非首页/非 Agent/非知识库的工作区主题覆盖，复用现有 Ant Design Provider |
| 中 | 管理导航绿色竖线、字号与知识库不同 | 共用 WorkspaceNavLink；14px 字号、8px 圆角、中性选中态、键盘焦点 |
| 中 | 管理标题、边距与诊断加载/完成状态不一致 | 共用 WorkspacePageHeader；列表标题 22/30，统一横向边距 |
| 中 | 资产/日志/上传/版本列表大字号、方边框和旧 hover | 统一记录标题、边框、间距、标签和 hover；保留业务行为 |
| 中 | 基础数据在 390px 下被 620px 表格撑宽至 636px | 网格 minmax(0,1fr) 和 min-width:0；表格内部滚动，子导航局部滚动。复验页面宽 375px，无页面横向溢出 |
| 中 | 共用 Combobox 被 Radix Trigger 注入 type=button，文字居中且无法输入；展开时弹层抢焦点 | 显式 type=text，并保留输入焦点；实测输入、候选新建提示正常，未执行创建 |
| 低 | 历史入口超大圆角、阴影及等宽 UI 标签残留 | 统一主题圆角、卡片边框和 UI 字体；正文代码字体保持 |
| 低 | 缺失记录落到框架默认 404 | 共用缺失内容样式及返回入口 |

## 实测状态

- Typecheck：PASS；生产 Build：PASS；git diff --check：PASS。
- 1440px 管理页面标题、导航字体/色值/圆角：PASS；390px 与 768px 代表页面无页面级横向溢出：PASS。表格与标签栏的局部滚动保留。
- 管理新建菜单、删除确认弹窗打开/取消（未删除）、表单分类候选展开/输入：PASS。
- Haldur 批量上传弹窗打开/关闭、Markdown 源码切换及返回：PASS；本轮没有上传或覆盖原资产。
- 首页、知识库、培训、Skill/字体/Prompt 详情、模型设置、既有 Agent 会话与 GenUI 预览：PASS（视觉与加载回归）。
- 未故障注入真实 Runtime；不可用/失败提示仅核对既有共用样式与自然缺失状态，网络异常内容态 NOT_VERIFIED。
- 未修改 Agent/GenUI 内部页面，未重测真实模型生成；业务增删改、真实上传保存不属于本轮视觉验收。

## 数据与运行边界

仅重新加载 3048 Hub 子进程以应用本地构建，3047 Supervisor、DSH、Proxy、Knowledge MCP PID 保持原值。Hub DATA 57 个、Haldur 187 个、DSH_HOME 96 个文件，前后全部哈希一致。未更改登录、模型 Key、权限或运行目录。没有 Push、Windows 部署或运行数据备份。

## 页面覆盖矩阵

| 路由模式 | 结果 | 说明 |
| --- | --- | --- |
| `/` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/assets/[id]/versions/[versionId]` | PARTIAL | 现存 DATA 没有对应实体；已核对缺失状态/编辑壳层，有数据内容态未验证。 |
| `/admin/components/[id]` | PARTIAL | 现存 DATA 没有对应实体；已核对缺失状态/编辑壳层，有数据内容态未验证。 |
| `/admin/components/[id]/edit` | PARTIAL | 现存 DATA 没有对应实体；已核对缺失状态/编辑壳层，有数据内容态未验证。 |
| `/admin/components/new` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/fonts/[id]` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/fonts/new` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/knowledge/[id]/edit` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/knowledge/new` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/login` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/logs` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/products/[id]` | PARTIAL | 现存 DATA 没有对应实体；已核对缺失状态/编辑壳层，有数据内容态未验证。 |
| `/admin/products/[id]/edit` | PARTIAL | 现存 DATA 没有对应实体；已核对缺失状态/编辑壳层，有数据内容态未验证。 |
| `/admin/products/new` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/prompts/[id]` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/prompts/new` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/runtime-diagnostics` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/settings` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/settings/base-data` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/skills/[id]` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/skills/[id]/versions/new` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/skills/new` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/sops/[id]` | PARTIAL | 现存 DATA 没有对应实体；已核对缺失状态/编辑壳层，有数据内容态未验证。 |
| `/admin/sops/new` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/test-environments` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/test-environments/[id]` | PARTIAL | 现存 DATA 没有对应实体；已核对缺失状态/编辑壳层，有数据内容态未验证。 |
| `/admin/test-environments/new` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/training` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/training/[id]/edit` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/training/create` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/uploads` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/uploads/new` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/admin/versions` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/agent` | PASS | 深色外壳、既有会话和 GenUI iframe 可见；未修改内部设计，未新增模型请求。 |
| `/agent/settings` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/assets/[id]` | PASS | 历史演示/原型入口，仅同步视觉，不代表后台业务能力。 |
| `/category/[category]` | PASS | 历史演示/原型入口，仅同步视觉，不代表后台业务能力。 |
| `/components` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/console` | PASS | 历史演示/原型入口，仅同步视觉，不代表后台业务能力。 |
| `/fonts` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/fonts/[id]` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/haldur-design-skill` | PASS | 目录、MD 预览/源码/返回、批量上传弹窗打开/取消；没有写资产。 |
| `/knowledge` | PASS | 全部、文档、AI、培训、产品/工具、资源；文章/微规范/Skill/字体/Prompt/视频详情及加载骨架。 |
| `/me` | PASS | 历史演示/原型入口，仅同步视觉，不代表后台业务能力。 |
| `/products` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/prompts` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/prompts/[id]` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/publish` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/search` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/skills` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/skills/[id]` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/sops` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/test-environments` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/topics` | PASS | 历史演示/原型入口，仅同步视觉，不代表后台业务能力。 |
| `/topics/[id]` | PASS | 历史演示/原型入口，仅同步视觉，不代表后台业务能力。 |
| `/training` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/training/[id]` | PASS | 已检查页面或其既有跳转；未提交表单。 |
| `/training/groups/[id]` | PASS | 已检查页面或其既有跳转；未提交表单。 |

## 截图与机器记录

证据目录：`/Users/zhouzhijun/.codex/visualizations/2026/10/15/01a13dd9-7d6b-7351-a5f5-2b8bdeed1d96/full-ui-audit-20261019`。

- [修改前管理台](/Users/zhouzhijun/.codex/visualizations/2026/10/15/01a13dd9-7d6b-7351-a5f5-2b8bdeed1d96/full-ui-audit-20261019/before_admin.png) / [修改后管理台](/Users/zhouzhijun/.codex/visualizations/2026/10/15/01a13dd9-7d6b-7351-a5f5-2b8bdeed1d96/full-ui-audit-20261019/final_admin.png)
- [修改前系统设置](/Users/zhouzhijun/.codex/visualizations/2026/10/15/01a13dd9-7d6b-7351-a5f5-2b8bdeed1d96/full-ui-audit-20261019/before_admin_settings.png) / [修改后系统设置](/Users/zhouzhijun/.codex/visualizations/2026/10/15/01a13dd9-7d6b-7351-a5f5-2b8bdeed1d96/full-ui-audit-20261019/final_admin_settings.png)
- [修改后运行诊断](/Users/zhouzhijun/.codex/visualizations/2026/10/15/01a13dd9-7d6b-7351-a5f5-2b8bdeed1d96/full-ui-audit-20261019/after_admin_runtime-diagnostics.png)
- [手机基础数据溢出修复](/Users/zhouzhijun/.codex/visualizations/2026/10/15/01a13dd9-7d6b-7351-a5f5-2b8bdeed1d96/full-ui-audit-20261019/mobile_base_data_fixed.png)
- [分类框输入与候选](/Users/zhouzhijun/.codex/visualizations/2026/10/15/01a13dd9-7d6b-7351-a5f5-2b8bdeed1d96/full-ui-audit-20261019/form_combobox_fixed.png)
- [删除确认（已取消）](/Users/zhouzhijun/.codex/visualizations/2026/10/15/01a13dd9-7d6b-7351-a5f5-2b8bdeed1d96/full-ui-audit-20261019/dialog_delete.png)
- [批量上传弹窗（已关闭）](/Users/zhouzhijun/.codex/visualizations/2026/10/15/01a13dd9-7d6b-7351-a5f5-2b8bdeed1d96/full-ui-audit-20261019/haldur_upload_modal.png)
- [原 Agent / GenUI 显示](/Users/zhouzhijun/.codex/visualizations/2026/10/15/01a13dd9-7d6b-7351-a5f5-2b8bdeed1d96/full-ui-audit-20261019/agent_preserved.png)
- 路由/尺寸记录：routes-desktop.json、routes-mobile.json、mobile-final-check.json、routes-tablet.json。
- 保留性核对：retention-check.json；data-before/after.json 仅哈希，不包含文件正文或凭据。

## 后续边界

缺少产品、组件、SOP、测试环境与通用版本实体的内容态保留 PARTIAL，不为截图向演示 DATA 写测试记录。历史原型入口的业务完善另立需求，不在视觉同步中扩展。共享导航、标题、主题与弹层继续复用，新增页面应沿用对应组件。
