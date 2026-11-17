# GenUI 主操作标记误判修复

GenUI 0.15.1 的源码限制使用 `\b(?:action|formAction|target)\s*=`；连字符也构成单词边界，因此 `data-genui-primary-action="true"` 被当成表单属性。修复为匹配空白起始的完整属性名 `\s(?:action|formAction|target)\s*=`，保留原有标签范围及导航、提交、网络和 HTML 注入限制。

修复加入现有固定版本与 SHA-256 校验的兼容补丁，不修改 npm 原包或绕过身份检查。旧补丁能恢复到受信原包后升级，重复安装不变，未知内容拒绝。

```sh
node scripts/verify-genui-navigation-attributes.mjs
```

Windows 可在现有 TS loader 下额外传入实际 GenUI `lib/index.js` 与原始失败版本 JSON，执行真实编译。测试只写临时输出目录，结束后清理，不更新生产会话、成果和模型设置。

- 6 种正常属性写法通过；21 种真实危险入口继续被拒绝。
- Windows 真实编译覆盖带字符串值、裸属性、表达式值，以及旧 Aurora 首个失败版本（保留原始表格、标题和辅助属性）；12 项真实表单／导航源码在编译前被拒绝且不产生输出。

Windows 采用独立 Release，基于当时实际运行的 prod16-r2，只更新补丁安装器及回归脚本，保留既有 Windows 与 HTML 预览修复。服务器发布、共享运行包原始字节备份和回滚证据位于 `D:\UED-Asset-Hub-Publishing\production-genui-attributes-20261117`。

`scripts/verify-genui-marker-browser.mjs` 使用实际运行包的 `buildArtifact` 生成带值标记的 React 按钮，再由 Windows Edge 读取真实编译输出，核对 `data-genui-primary-action="true"` 渲染和点击后的状态变化。它使用独立临时浏览器配置与管道，结束后清理，不复用用户浏览器或会话。

```sh
node --import TS_LOADER scripts/verify-genui-marker-browser.mjs GENUI_SERVER_MODULE HTML_BROWSER_CHECK_MODULE
```

## 最终结果

已部署 `internal-0.1.1-prod17-genui-attributes-20261117`，生产任务 Running。

- 实际 Windows 运行包：6 项正常源码检查、21 项危险入口检查通过；4 个真实编译通过（包括原始 Aurora 失败版本），12 个危险 JSX 构建被拒绝。
- Edge：带字符串值的主操作标记渲染为 `data-genui-primary-action="true"`，点击后按钮状态更新，运行无错误。
- 既有 GenUI 历史版本文件哈希与部署前一致。
- 上一轮 HTML 预览复验通过：原会话冷恢复、11 个筛选字段、查询／重置、包装页与 ZIP 均正常。
- 服务器提供 `Rollback-To-Prod16.ps1`：受控停止后先校验并恢复共享 GenUI 服务端字节，再切回原 prod16-r2；保留成果与业务数据。此回滚预案未实际执行。

证据：[编译回归](./final-compile-result.json)、[Edge 回归](./final-browser-result.json)、[部署状态](./final-state.json)。本次没有调用模型重新生成设计，也没有将测试写入生产会话。
