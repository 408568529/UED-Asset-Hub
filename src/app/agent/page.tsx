import { redirect } from "next/navigation";
import { AgentShell } from "@/components/agent/AgentShell";
import { hasAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  if (!await hasAdminSession()) redirect("/admin/login");
  return <AgentShell />;
}
