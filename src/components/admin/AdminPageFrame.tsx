import type { ReactNode } from "react";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";

export function AdminPageFrame({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
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
