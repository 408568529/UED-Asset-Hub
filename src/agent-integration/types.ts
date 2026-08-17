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

export type AgentConversationMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};

export type AgentConversation = {
  messages: AgentConversationMessage[];
  running: boolean;
};
