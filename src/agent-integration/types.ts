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

export type AgentExecutionStatus = "running" | "completed" | "failed";

export type AgentExecutionActivity = {
  id: string;
  toolName: string;
  title: string;
  kind: string;
  status: AgentExecutionStatus;
  startedAt: string;
  completedAt?: string;
  detail?: string;
  error?: string;
};

export type AgentSkill = {
  name: string;
  description: string;
  whenToUse?: string;
  modelInvocable: boolean;
};

export type AgentExecutionSnapshot = {
  activities: AgentExecutionActivity[];
  skills: AgentSkill[];
  running: boolean;
};

export type AgentQuestionOption = {
  label: string;
  description?: string;
};

export type AgentQuestion = {
  id: string;
  question: string;
  detail?: string;
  header?: string;
  options?: AgentQuestionOption[];
  multiSelect?: boolean;
  intent?: {
    kind: "plan-review";
    approve: string;
  };
};

export type AgentApprovalInteraction = {
  kind: "approval";
  rpcId: string;
  sessionId: string;
  approvalId: string;
  toolName: string;
  callId?: string;
  reason?: string;
};

export type AgentQuestionInteraction = {
  kind: "question";
  rpcId: string;
  sessionId: string;
  questions: AgentQuestion[];
};

export type AgentPendingInteraction = AgentApprovalInteraction | AgentQuestionInteraction;

export type AgentInteractionEvent =
  | { type: "requested"; interaction: AgentPendingInteraction }
  | { type: "approval-resolved"; sessionId: string; approvalId: string }
  | { type: "question-resolved"; sessionId: string; rpcId: string };

export type AgentQuestionAnswer = {
  id: string;
  selected: string[];
  custom?: string;
};
