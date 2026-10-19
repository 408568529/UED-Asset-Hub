"use client";

import { usePathname } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import "@/components/knowledge/knowledge-theme.css";
import "./asset-theme.css";
import "./workspace-theme.css";
import { Header } from "@/components/layout/Header";
import { KnowledgeThemeProvider } from "@/components/knowledge/KnowledgeThemeProvider";

export function AppChrome({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const agentWorkbench = pathname === "/agent";
  const assetWorkspace = pathname !== "/" && !agentWorkbench && !/^\/knowledge(?:\/|$)/.test(pathname);

  return (
    <div className={agentWorkbench ? "agent-shell-theme flex h-dvh min-h-0 flex-col overflow-hidden" : "flex min-h-screen flex-col"}>
      <Header />
      <div className={agentWorkbench ? "flex min-h-0 flex-1 flex-col" : "flex-1"}>{assetWorkspace ? <div className="asset-visual-theme" data-hub-visual="v1.1"><KnowledgeThemeProvider>{children}</KnowledgeThemeProvider></div> : children}</div>
      {agentWorkbench ? null : <Footer />}
    </div>
  );
}
