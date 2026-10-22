import assert from "node:assert/strict";
import { resolveHaldurMarkdownLink as resolve } from "../src/lib/haldurMarkdownLinks";
const source = "3、业务组件/标签输入框.md";
for (const [href, path] of [["../4、基础组件/输入框.md", "4、基础组件/输入框.md"], ["../4、基础组件/标签.md", "4、基础组件/标签.md"], ["./表单.md", "3、业务组件/表单.md"], ["../4%E3%80%81%E5%9F%BA%E7%A1%80%E7%BB%84%E4%BB%B6/%E8%BE%93%E5%85%A5%E6%A1%86.md", "4、基础组件/输入框.md"]]) {
  assert.equal(resolve(source, href), `/haldur-design-skill?file=${encodeURIComponent(path)}`);
}
assert.equal(resolve(source, "./标签输入框-preview.html"), `/api/haldur-design-skill/preview/view?path=${encodeURIComponent("3、业务组件/标签输入框-preview.html")}`);
assert.equal(resolve(source, "./assets/图.svg"), `/api/haldur-design-skill/preview/view?path=${encodeURIComponent("3、业务组件/assets/图.svg")}`);
assert.equal(resolve(source, "./说明.pdf"), `/api/haldur-design-skill/files?path=${encodeURIComponent("3、业务组件/说明.pdf")}`);
for (const href of ["../../secret.md", "../%2e%2e/secret.md", "./%2fsecret.md", "./%5csecret.md", "./%00.md", "./%ZZ.md", "javascript:alert(1)", "file:///etc/passwd", "//example.org/a.md"]) assert.equal(resolve(source, href), "", href);
for (const href of ["https://example.org/guide.md", "mailto:design@example.org", "#preview", "/knowledge"]) assert.equal(resolve(source, href), href);
assert.equal(resolve("SKILL.md", "./3、业务组件/表单.md#rules"), `/haldur-design-skill?file=${encodeURIComponent("3、业务组件/表单.md")}#rules`);
console.log("PASS: Skill relative Markdown, safe previews, downloads, encoded paths, external links and traversal rejection");
