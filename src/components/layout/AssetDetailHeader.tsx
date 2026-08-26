import type { ReactNode } from "react";

export function AssetDetailHeader({
  eyebrow,
  marker,
  title,
  description,
  meta,
  tags,
  actions
}: {
  eyebrow: string;
  marker: string;
  title: string;
  description: string;
  meta?: ReactNode;
  tags?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="surface-panel overflow-hidden border-t-[3px] border-t-primary">
      <div className="grid lg:grid-cols-[9rem_minmax(0,1fr)_19rem]">
        <div className="flex items-center justify-between border-b border-border bg-[hsl(var(--surface-subtle)/0.62)] p-5 lg:flex-col lg:items-start lg:border-b-0 lg:border-r lg:p-6">
          <p className="section-kicker">{eyebrow}</p>
          <p className="font-mono text-3xl font-black text-foreground/75 lg:text-4xl">{marker}</p>
        </div>
        <div className="border-b border-border p-6 md:p-9 lg:border-b-0 lg:border-r">
          <h1 className="max-w-4xl text-2xl font-black leading-[1.08] tracking-[-0.025em] md:text-4xl">{title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-muted-foreground">{description}</p>
          {tags ? <div className="mt-6 flex flex-wrap gap-2">{tags}</div> : null}
        </div>
        <aside className="flex flex-col justify-between gap-7 p-6">
          {meta ? <div className="space-y-3 text-sm leading-6 text-muted-foreground">{meta}</div> : <span />}
          {actions ? <div className="grid gap-2">{actions}</div> : null}
        </aside>
      </div>
    </header>
  );
}
