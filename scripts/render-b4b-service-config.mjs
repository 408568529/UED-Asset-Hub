import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createB4bIdentity, renderB4bWinSwTemplate } from "./b4b-service-contract.mjs";

const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => value.startsWith("--") && values[index + 1] ? [...pairs, [value.slice(2), values[index + 1]]] : pairs, []));
const runId = options["run-id"], root = path.win32.normalize(options["b4b-root"] || ""), templatePath = path.resolve(options.template || ""), output = path.win32.normalize(options.output || "");
if (process.platform !== "win32" || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{6,46}[A-Za-z0-9])?$/.test(runId || "") || path.win32.basename(root) !== runId || path.win32.dirname(root).toLowerCase() !== "d:\\ued-asset-hub-staging\\b4b" || output.toLowerCase() !== path.win32.join(root, "service", `${createB4bIdentity(runId).serviceName}.xml`).toLowerCase()) throw new Error("B4B service configuration target identity is invalid.");
const identity = createB4bIdentity(runId), template = await readFile(templatePath, "utf8"), rendered = renderB4bWinSwTemplate(template, { root, identity });
if (rendered.includes("{{") || /name="(?:ADMIN_PASSWORD|ADMIN_SESSION_SECRET|AGENT_GATEWAY_TOKEN|TEST_ENV_ENCRYPTION_KEY|DEEPSEEK_API_KEY)"/u.test(rendered)) throw new Error("B4B service configuration contains unresolved or secret fields.");
const temporary = `${output}.b4b-tmp`;
await writeFile(temporary, rendered, { flag: "wx" });
await rename(temporary, output);
console.log(JSON.stringify({ result: "PASS", b4bRunId: runId, serviceName: identity.serviceName, configPath: output, nodeEnv: "production", credentialBundle: "isolated-path-reference-only", secretValuePresent: false }));
