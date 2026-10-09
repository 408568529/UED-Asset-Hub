import assert from "node:assert/strict";
import { parseWindowsCredentialBundle } from "./windows-credential-bundle.mjs";

const required = { adminPassword: "admin-password", adminSessionSecret: "session-secret", gatewayToken: "gateway-token", testEnvironmentEncryptionKey: "encryption-key" };
const bundle = (credentials) => JSON.stringify({ schemaVersion: 1, credentials });
assert.deepEqual(parseWindowsCredentialBundle(bundle({ ...required, deepseekApiKey: "provider-key" })), { ADMIN_PASSWORD: required.adminPassword, ADMIN_SESSION_SECRET: required.adminSessionSecret, AGENT_GATEWAY_TOKEN: required.gatewayToken, TEST_ENV_ENCRYPTION_KEY: required.testEnvironmentEncryptionKey, DEEPSEEK_API_KEY: "provider-key" });
assert.deepEqual(parseWindowsCredentialBundle(bundle(required)), { ADMIN_PASSWORD: required.adminPassword, ADMIN_SESSION_SECRET: required.adminSessionSecret, AGENT_GATEWAY_TOKEN: required.gatewayToken, TEST_ENV_ENCRYPTION_KEY: required.testEnvironmentEncryptionKey });
for (const credentials of [
  { ...required, deepseekApiKey: "" },
  { ...required, deepseekApiKey: 1 },
  { ...required, adminPassword: "" },
  { ...required, adminSessionSecret: "" },
  { ...required, gatewayToken: "" },
  { ...required, testEnvironmentEncryptionKey: "" },
]) assert.throws(() => parseWindowsCredentialBundle(bundle(credentials)));
console.log("[UED Agent] Windows credential bundle optional-provider contract passed.");
