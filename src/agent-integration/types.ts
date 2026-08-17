export type AgentRuntimeState = "ready" | "unavailable" | "misconfigured" | "disabled";

export type AgentRuntimeStatus = {
  state: AgentRuntimeState;
  message: string;
  checkedAt: string;
  runtimeVersion: string;
};
