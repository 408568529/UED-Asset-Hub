import type { ReactNode } from "react";
import { AdminTabs } from "@/components/admin/AdminTabs";

export function AdminWorkspace({ children }: { children: ReactNode }) {
  return (
    <div className="mt-12 grid gap-10 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-12">
      <aside className="lg:sticky lg:top-28 lg:self-start"><AdminTabs /></aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
