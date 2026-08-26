import type { ReactNode } from "react";
import { AdminTabs } from "@/components/admin/AdminTabs";

export function AdminWorkspace({ children }: { children: ReactNode }) {
  return (
    <div className="admin-workspace grid min-h-[calc(100dvh-4.5rem)] bg-[hsl(var(--surface))] lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-stretch">
      <aside className="border-b border-border bg-[hsl(var(--surface-subtle)/0.58)] px-3 py-4 lg:min-h-full lg:border-b-0 lg:border-r lg:px-4 lg:py-5"><AdminTabs /></aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
