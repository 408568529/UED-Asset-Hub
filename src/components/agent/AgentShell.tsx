import { AgentOfficialWorkbench } from "@/components/agent/AgentOfficialWorkbench";
import { AgentManagementToolbar } from "@/components/agent/AgentManagementToolbar";

export function AgentShell({ canManage = false }: { canManage?: boolean }) {
  return (
    <main className="flex min-h-0 flex-1 flex-col bg-[#101216]">
      <AgentManagementToolbar canManage={canManage} />
      <AgentOfficialWorkbench canManage={canManage} />
    </main>
  );
}
