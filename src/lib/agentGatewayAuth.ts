import { timingSafeEqual } from "node:crypto";

function configuredToken() {
  return process.env.AGENT_GATEWAY_TOKEN?.trim() ?? "";
}

export function isAgentGatewayAuthorized(request: Request) {
  const token = configuredToken();
  const value = request.headers.get("authorization") ?? "";
  const provided = value.startsWith("Bearer ") ? value.slice("Bearer ".length) : "";
  if (!token || !provided) return false;
  const expected = Buffer.from(token);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function assertAgentGatewayConfigured() {
  if (!configuredToken()) throw new Error("Knowledge Gateway is not configured.");
}
