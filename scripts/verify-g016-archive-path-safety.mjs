import assert from "node:assert/strict";
import { validateArchiveMemberPath } from "./windows-release-constructor.mjs";

for (const member of ["docs/Windows主机发布更新流程.html", "docs/Windows主机发布更新流程.md", "scripts/启动 UED Asset Hub Host Runner.bat", "scripts/启动 UED Asset Hub.bat", "nested/中文 空格/file.txt", "ascii/file.txt"]) assert.equal(validateArchiveMemberPath(member), member);
for (const member of ["../x", "a/../../x", "/x", "C:/x", "C:\\x", "\\\\server\\share", "\\\\?\\C:\\x", "CON", "a/trailing.", "a/trailing ", "a/<bad>"]) assert.throws(() => validateArchiveMemberPath(member));
console.log("[G-016] UTF-8 archive member path safety regression: PASS");
