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
    <section className="grid border-y border-border sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="py-6 sm:border-r sm:border-border sm:px-6 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0">
          <p className="text-3xl font-black leading-none md:text-4xl">{item.value}</p>
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
        </div>
      ))}
    </section>
  );
}
