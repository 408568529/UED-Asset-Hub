import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { KnowledgeWorkspaceShell } from "@/components/knowledge/KnowledgeLibraryWorkspace";
import { AssetFormWorkspace } from "@/components/admin/AssetFormWorkspace";

export function KnowledgeAuthoringWorkspace({ title, description, returnHref, children }: { title: string; description?: string; returnHref: string; children: ReactNode }) {
  return (
    <KnowledgeWorkspaceShell mode="authoring">
      <div className="knowledge-authoring-content workspace-content-transition">
        <header className="knowledge-authoring-header">
          <Link href={returnHref} className="inline-flex min-h-9 items-center gap-2 text-sm font-bold text-muted-foreground transition hover:text-foreground"><ArrowLeft size={16} />返回知识库</Link>
          <div className="mt-5"><h1 className="text-xl font-black tracking-[-0.025em]">{title}</h1>{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}</div>
        </header>
        <AssetFormWorkspace>{children}</AssetFormWorkspace>
      </div>
    </KnowledgeWorkspaceShell>
  );
}
