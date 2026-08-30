export type HostSecurityConfig = { username: string; password: string; sessionSecret: string };
export type ProxySessionConfig = { username: string; sessionSecret: string };
export class HostSecurityConfigError extends Error {
  reasonCode: "host_security_config_missing" | "host_security_config_invalid";
  field: "ADMIN_PASSWORD" | "ADMIN_SESSION_SECRET";
}
export function resolveHostSecurityConfig(environment?: NodeJS.ProcessEnv): HostSecurityConfig;
export function resolveProxySessionConfig(environment?: NodeJS.ProcessEnv): ProxySessionConfig;
export function isHostSecurityConfigError(error: unknown): error is HostSecurityConfigError;
