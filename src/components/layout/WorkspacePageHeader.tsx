import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WorkspacePageHeader({ title, description, eyebrow, actions, className }: { title: string; description?: string; eyebrow?: string; actions?: ReactNode; className?: string }) {
  return <header className={cn("workspace-page-header", className)}>
    <div className="min-w-0">{eyebrow ? <p className="workspace-page-eyebrow">{eyebrow}</p> : null}<h1>{title}</h1>{description ? <p className="workspace-page-description">{description}</p> : null}</div>
    {actions ? <div className="workspace-page-actions">{actions}</div> : null}
  </header>;
}
