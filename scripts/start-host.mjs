import path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "./host-supervisor.mjs";
import { isHostSecurityConfigError } from "./host-security-config.mjs";

export function assertHostRuntimeResolutionEnvironment(environment = process.env) {
  if (environment.NODE_PATH?.trim()) throw new Error("NODE_PATH is prohibited for a self-contained Candidate.");
  if (/(?:^|\s)--(?:require|import|loader)(?:=|\s)/u.test(environment.NODE_OPTIONS || "")) throw new Error("NODE_OPTIONS module-resolution hooks are prohibited for a self-contained Candidate.");
  for (const key of ["UED_SOURCE_ROOT", "UED_ASSET_HUB_SOURCE_ROOT", "ASSET_HUB_SOURCE_ROOT"]) if (environment[key]?.trim()) throw new Error(`${key} source-tree fallback is prohibited.`);
}

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile && invokedFile === fileURLToPath(import.meta.url)) {
  try {
    assertHostRuntimeResolutionEnvironment();
    main().catch((error) => {
      if (isHostSecurityConfigError(error)) console.error(`[Host Supervisor] ${error.reasonCode}: ${error.field}`);
      else console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
