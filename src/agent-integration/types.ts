export type AgentRuntimeState = "ready" | "unavailable" | "misconfigured" | "disabled";

export type AgentRuntimeStatus = {
  state: AgentRuntimeState;
  message: string;
  checkedAt: string;
  runtimeVersion: string;
};

export type AgentSession = {
  id: string;
  title: string | null;
  updatedAt: string;
  running: boolean;
  blank: boolean;
  agentPreset?: string;
  workspacePath?: string;
};
