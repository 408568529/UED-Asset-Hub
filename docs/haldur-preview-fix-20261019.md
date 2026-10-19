# Haldur HTML/SVG 预览加载修复（2026-10-19）

症状：3047 文件预览一直显示“正在准备预览”。实际预览数据接口 200，但 `/haldur-preview.js` 为 404。上一轮独立 standalone 构建复制了 Next static 目录，却漏带 `public`；缺少查看器脚本时 HTML 和 SVG 都无法初始化。

修复：补齐当前 standalone 的 public 文件，并让 Mac 配置加载器在启动前复制代码目录的 public。SVG 随即恢复。继续发现内置浏览器对 sandboxed Blob HTML iframe 仍停在“正在加载隔离文档”，而 Chrome 正常；HTML 查看器改用 `srcdoc`，保持 `sandbox="allow-scripts"`、无 allow-same-origin，以及原父/子 CSP。内置浏览器随后正常渲染。

验证：

- 当前 `/haldur-preview.js` 200，内容与更新后的代码逐字节一致。
- 内置浏览器真实打开 `2、典型页面/assets/base-page-preview.html`，显示“基础页面框架预览”；点击二级页后显示“二级页 / 初始态”与面包屑布局。
- Chrome 同一 HTML 使用新查看器渲染正常。
- 内置浏览器真实打开 `新开页典型场景-线框图.svg`，图像 complete=true，naturalWidth=1200，naturalHeight=760。
- `node --check public/haldur-preview.js`、Host security 配置测试、Haldur 预览定向测试通过；路径、符号链接、越界、编码、资源范围等负例保持通过。
- 原 DATA、Haldur 187 文件、媒体的哈希未变；DSH 仍为同一 PID 9201。只让既有 Supervisor 重新启动内部 Hub 以更新静态目录清单。

没有改动预览接口、CSP、Windows 配置、资产或会话。本轮只改静态 JS 和 Python 加载器，不需要重新编译 Next 页面，也没有执行 Push 或 Windows 部署。

证据：`/Users/zhouzhijun/.codex/visualizations/2026/10/15/01a13dd9-7d6b-7351-a5f5-2b8bdeed1d96/preview-fix-20261019/` 下的 HTML/SVG 浏览器快照与截图。
