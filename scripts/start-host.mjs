import { main } from "./host-supervisor.mjs";
import { isHostSecurityConfigError } from "./host-security-config.mjs";

main().catch((error) => {
  if (isHostSecurityConfigError(error)) console.error(`[Host Supervisor] ${error.reasonCode}: ${error.field}`);
  else console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
