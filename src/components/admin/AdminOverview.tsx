export function AdminOverview({
  assetTotal,
  monthlyNewCount,
  lastUpdatedLabel
}: {
  assetTotal: number;
  monthlyNewCount: number;
  lastUpdatedLabel: string;
}) {
  const items = [
    { label: "资产总数", value: String(assetTotal) },
    { label: "本月新增", value: String(monthlyNewCount) },
    { label: "最近更新", value: lastUpdatedLabel }
  ];

  return (
    <section aria-label="资产概览" className="flex flex-wrap items-center gap-x-7 gap-y-2 border-b border-border bg-[hsl(var(--surface-subtle)/0.38)] px-4 py-2.5 text-xs text-muted-foreground">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-2">
          <p className="font-mono text-base font-black leading-none tabular-nums text-foreground">{item.value}</p>
          <p>{item.label}</p>
        </div>
      ))}
    </section>
  );
}
