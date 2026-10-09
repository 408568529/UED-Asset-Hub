import path from "node:path";
import { b4bWindowsServiceName, resolveWindowsServiceIdentity } from "./windows-service-identity.mjs";

const forbiddenEvidenceKeys = /(?:token|secret|password|credential|private.?key|endpoint)/i;

function fail(message) { throw new Error(`B4B service contract is invalid: ${message}`); }

export function createB4bIdentity(runId) {
  const serviceName = b4bWindowsServiceName(runId);
  return resolveWindowsServiceIdentity({ environment: { UED_WINDOWS_SERVICE_NAME: serviceName, UED_B4B_RUN_ID: runId } });
}

export function renderB4bWinSwTemplate(template, { root, identity }) {
  if (typeof template !== "string" || !template.includes("{{UED_ROOT}}") || !template.includes("{{UED_SERVICE_NAME}}") || !template.includes("{{UED_B4B_RUN_ID}}")) fail("WinSW template placeholders");
  if (!identity || identity.kind !== "b4b" || !path.win32.isAbsolute(root) || root.startsWith("\\\\")) fail("render inputs");
  const rendered = template
    .replaceAll("{{UED_ROOT}}", root)
    .replaceAll("{{UED_SERVICE_NAME}}", identity.serviceName)
    .replaceAll("{{UED_B4B_RUN_ID}}", identity.b4bRunId);
  if (/\{\{[^}]+\}\}/.test(rendered) || !rendered.includes(`<id>${identity.serviceName}</id>`) || !rendered.includes("<startmode>Manual</startmode>") || !rendered.includes(`UED_WINDOWS_SERVICE_NAME\" value=\"${identity.serviceName}`)) fail("rendered WinSW identity or demand-start mode");
  return rendered;
}

export function assertB4bEvidence(value, expectedRunId) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.b4bRunId !== expectedRunId) fail("evidence run binding");
  const visit = (node, key = "") => {
    if (forbiddenEvidenceKeys.test(key)) fail("evidence contains a secret-like field");
    if (Array.isArray(node)) return node.forEach((item) => visit(item));
    if (node && typeof node === "object") Object.entries(node).forEach(([name, item]) => visit(item, name));
  };
  visit(value);
  return value;
}
