import { redirect } from "next/navigation";
import { AgentModelSettings } from "@/components/agent/AgentModelSettings";
import { hasAdminSession } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export default async function AgentModelSettingsPage() {
  if (!await hasAdminSession()) redirect("/admin/login");
  return <main className="min-h-[calc(100dvh-4.5rem)]"><AgentModelSettings /></main>;
}
