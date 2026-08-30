import "server-only";
import { resolveHostSecurityConfig } from "../../scripts/host-security-config.mjs";

export const ADMIN_SESSION_COOKIE = "ued_admin_session";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 8;
export function getAdminSecurityConfig() {
  return resolveHostSecurityConfig(process.env);
}
