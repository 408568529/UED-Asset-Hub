function parsePort(value, name, fallback) {
  const parsed = Number.parseInt(value || String(fallback), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) throw new Error(`${name} must be a valid TCP port.`);
  return parsed;
}

export function resolveHostPorts(environment = process.env) {
  const ports = {
    dsh: parsePort(environment.DSH_PORT, "DSH_PORT", 3080),
    proxy: parsePort(environment.AGENT_PROXY_PORT, "AGENT_PROXY_PORT", 3081),
    publicHub: parsePort(environment.HOST_PORT, "HOST_PORT", 3027),
    internalHub: parsePort(environment.HOST_INTERNAL_PORT, "HOST_INTERNAL_PORT", 3028),
    gateway: parsePort(environment.KNOWLEDGE_GATEWAY_MCP_PORT, "KNOWLEDGE_GATEWAY_MCP_PORT", 3082)
  };
  if (new Set(Object.values(ports)).size !== Object.keys(ports).length) throw new Error("Host runtime ports must be unique.");
  return ports;
}
