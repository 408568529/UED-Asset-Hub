import { redirect } from "next/navigation";
import { AgentShell } from "@/components/agent/AgentShell";
import { hasAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const canManage = await hasAdminSession();
  if (!canManage && process.env.AGENT_PUBLIC_ACCESS !== "true") redirect("/admin/login");
  return <AgentShell canManage={canManage} />;
}
