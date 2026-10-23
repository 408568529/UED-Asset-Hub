"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isAdminLoggedIn } from "@/lib/adminSession";

export function AgentManagementToolbar({ canManage }: { canManage: boolean }) {
  const [visible, setVisible] = useState(canManage);
  useEffect(() => { setVisible(canManage); }, [canManage]);
  useEffect(() => {
    const sync = () => { void isAdminLoggedIn().then(setVisible); };
    window.addEventListener("ued-admin-session-change", sync);
    return () => window.removeEventListener("ued-admin-session-change", sync);
  }, []);
  if (!visible) return null;
  return <div className="agent-workbench-toolbar flex shrink-0 items-center justify-between border-b border-white/10 bg-[#101216] px-5 py-3 text-sm text-white/70">
    <span>Agent 工作台</span>
    <Link href="/agent/settings" className="border border-white/25 px-3 py-1.5 font-medium text-white transition hover:border-lime-300 hover:text-lime-200">模型设置</Link>
  </div>;
}
