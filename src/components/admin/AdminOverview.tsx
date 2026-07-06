export function AdminOverview({
  productCount,
  componentCount,
  sopCount,
  skillCount
}: {
  productCount: number;
  componentCount: number;
  sopCount: number;
  skillCount: number;
}) {
  const items = [
    { label: "资产总数", value: productCount + componentCount + sopCount + skillCount },
    { label: "Vibe Product", value: productCount },
    { label: "Skill Center", value: skillCount },
    { label: "组件规范", value: componentCount },
    { label: "标准 SOP", value: sopCount }
  ];

  return (
    <section className="mt-12 grid border-t border-foreground/10 md:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="border-b border-foreground/10 py-6 md:border-r md:px-6 md:last:border-r-0">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
          <p className="mt-4 text-5xl font-black leading-none">{item.value}</p>
        </div>
      ))}
    </section>
  );
}
