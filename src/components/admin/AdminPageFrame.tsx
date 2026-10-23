import type { ReactNode } from "react";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AssetFormWorkspace } from "@/components/admin/AssetFormWorkspace";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";

export function AdminPageFrame({ title, description, actions, children, contentLayout = "default", returnHref = "/admin", returnLabel = "返回管理台" }: { title: string; description?: string; actions?: ReactNode; children: ReactNode; contentLayout?: "default" | "form"; returnHref?: string; returnLabel?: string }) {
  if (contentLayout === "form") {
    return (
      <main className="admin-authoring-workspace">
        <div className="admin-authoring-content workspace-content-transition">
          <header className="admin-authoring-header">
            <Link href={returnHref} className="inline-flex min-h-9 items-center gap-2 text-sm font-bold text-muted-foreground transition hover:text-foreground"><ArrowLeft size={16} />{returnLabel}</Link>
            <WorkspacePageHeader className="mt-5" title={title} description={description} actions={actions} />
          </header>
          <AssetFormWorkspace>{children}</AssetFormWorkspace>
        </div>
      </main>
    );
  }

  return (
    <main>
      <AdminWorkspace>
        <WorkspacePageHeader className="admin-page-header" title={title} description={description} actions={actions} />
        <div className="admin-page-content">{children}</div>
      </AdminWorkspace>
    </main>
  );
}
