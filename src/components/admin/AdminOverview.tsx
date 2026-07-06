export function AdminOverview({
  productCount,
  componentCount,
  sopCount,
  skillCount,
  fontCount,
  promptCount
}: {
  productCount: number;
  componentCount: number;
  sopCount: number;
  skillCount: number;
  fontCount: number;
  promptCount: number;
}) {
  const items = [
    { label: "资产总数", value: productCount + componentCount + sopCount + skillCount + fontCount + promptCount },
    { label: "Vibe Product", value: productCount },
    { label: "Skill Center", value: skillCount },
    { label: "Font Library", value: fontCount },
    { label: "Prompt Library", value: promptCount },
    { label: "组件规范", value: componentCount },
    { label: "标准 SOP", value: sopCount }
  ];

  return (
    <section className="mt-12 grid border-t border-foreground/10 md:grid-cols-4 lg:grid-cols-7">
      {items.map((item) => (
        <div key={item.label} className="border-b border-foreground/10 py-6 md:border-r md:px-6 md:last:border-r-0">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
          <p className="mt-4 text-5xl font-black leading-none">{item.value}</p>
        </div>
      ))}
    </section>
  );
}
