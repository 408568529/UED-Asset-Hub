import type { ReactNode } from "react";
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
            <div className="mt-5"><h1 className="text-xl font-black tracking-[-0.025em]">{title}</h1>{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}</div>
          </header>
          <AssetFormWorkspace>{children}</AssetFormWorkspace>
        </div>
      </main>
    );
  }

  return (
    <main>
      <AdminWorkspace>
        <header className="admin-page-header">
          <div><h1 className="text-lg font-black tracking-[-0.02em]">{title}</h1>{description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}</div>
          {actions}
        </header>
        <div className="admin-page-content">{children}</div>
      </AdminWorkspace>
    </main>
  );
}
