import { AgentOfficialWorkbench } from "@/components/agent/AgentOfficialWorkbench";
import Link from "next/link";

export function AgentShell() {
  return (
    <main className="min-h-[calc(100dvh-4.5rem)] bg-[#101216]">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#101216] px-5 py-3 text-sm text-white/70">
        <span>Agent 工作台</span>
        <Link href="/agent/settings" className="border border-white/25 px-3 py-1.5 font-medium text-white transition hover:border-lime-300 hover:text-lime-200">模型设置</Link>
      </div>
      <AgentOfficialWorkbench />
    </main>
  );
}
