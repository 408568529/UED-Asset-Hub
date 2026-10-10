"use client";

import { usePathname } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";

export function AppChrome({ children }: Readonly<{ children: React.ReactNode }>) {
  const agentWorkbench = usePathname() === "/agent";

  return (
    <div className={agentWorkbench ? "flex h-dvh min-h-0 flex-col overflow-hidden" : "flex min-h-screen flex-col"}>
      <Header />
      <div className={agentWorkbench ? "flex min-h-0 flex-1 flex-col" : "flex-1"}>{children}</div>
      {agentWorkbench ? null : <Footer />}
    </div>
  );
}
