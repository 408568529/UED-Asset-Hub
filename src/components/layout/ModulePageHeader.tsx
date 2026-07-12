import type { ReactNode } from "react";

export function ModulePageHeader({
  eyebrow,
  title,
  description,
  count,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <header className="border-b border-foreground/[0.1] pb-12 md:pb-16">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-end">
        <div>
          <div className="flex items-center gap-4">
            <span className="h-px w-10 bg-primary" />
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">{eyebrow}</p>
          </div>
          <h1 className="mt-7 max-w-5xl text-2xl font-black leading-tight md:text-3xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">{description}</p>
        </div>

        <div>
          {children}
          <div className="mt-4 flex items-center justify-between border-t border-foreground/[0.1] pt-3 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <span>Library Index</span>
            <span>{String(count).padStart(2, "0")} Assets</span>
          </div>
        </div>
      </div>
    </header>
  );
}
