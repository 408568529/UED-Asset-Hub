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
    <header className="surface-panel relative overflow-hidden border-t-[3px] border-t-primary">
      <div className="grid lg:grid-cols-[10.5rem_minmax(0,1fr)_23rem]">
        <div className="flex items-start justify-between border-b border-border bg-[hsl(var(--surface-subtle)/0.65)] p-5 lg:flex-col lg:border-b-0 lg:border-r lg:p-6">
          <p className="section-kicker">{eyebrow}</p>
          <div className="text-right lg:text-left">
            <p className="font-mono text-4xl font-black leading-none tabular-nums md:text-5xl">{String(count).padStart(2, "0")}</p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">indexed assets</p>
          </div>
        </div>

        <div className="border-b border-border p-6 md:p-8 lg:border-b-0 lg:border-r lg:p-9">
          <h1 className="max-w-4xl text-3xl font-black leading-[1.06] tracking-[-0.025em] md:text-4xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">{description}</p>
        </div>

        <div className="flex min-h-36 flex-col justify-center p-5 md:p-6">
          {children ? children : <p className="text-sm leading-6 text-muted-foreground">浏览当前模块的全部内容，数据由本地主机实时读取。</p>}
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <span>Library index</span>
            <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 bg-primary" />Live</span>
          </div>
        </div>
      </div>
    </header>
  );
}
