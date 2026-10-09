import assert from "node:assert/strict";
import { applyCredentialAcl, credentialAclArguments, inspectCredentialAcl, validateCredentialAcl } from "./windows-credential-acl.mjs";
const context = { output: "D:\\UED-Asset-Hub-Staging\\b4b\\x\\credentials\\bundle.dpapi", serviceSid: "S-1-5-80-1" };
assert.throws(() => credentialAclArguments(context));
await assert.rejects(() => applyCredentialAcl(context));
await assert.rejects(() => inspectCredentialAcl(context));
await assert.rejects(() => validateCredentialAcl(context));
console.log("[UED Agent] Windows credential ACL contract passed.");
