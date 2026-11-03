import { createHash } from "node:crypto";

export const nativeSettingsClientPath = "/plugins/@deepseek-ai/dsh-client-ui-settings/client.js";
const pinnedHash = "d93f420e0c9caff2ba35c6e766f3cfaf38b8195305272efe63e365625b47a878";

export function nativeSettingsClient(source, administrator) {
  if (!administrator) return source;
  if (createHash("sha256").update(source).digest("hex") !== pinnedHash) throw new Error("Native settings client version does not match the validated DSH build.");
  const expression = 'connection.isLoopback ? "host" : "memory"';
  if (source.split(expression).length !== 3) throw new Error("Native settings scope contract changed.");
  // The authenticated Hub proxy owns persistence authorization. Keep native
  // directory/editor actions and the connection's loopback identity unchanged.
  return source.replaceAll(expression, '"host"');
}
