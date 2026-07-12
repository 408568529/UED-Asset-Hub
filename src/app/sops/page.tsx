import { SopCard } from "@/components/sop/SopCard";
import { ModulePageHeader } from "@/components/layout/ModulePageHeader";
import { Input } from "@/components/ui/input";
import { sopService } from "@/services/sopService";

export default async function SopsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const sops = await sopService.getSops(q);

  return (
    <main className="mx-auto max-w-7xl px-5 py-20 md:py-28">
      <ModulePageHeader eyebrow="Standard SOP" title="标准流程资产库" description="集中管理设计走查、交付协作、评审验收等标准流程。" count={sops.length}>
        <form action="/sops">
          <Input name="q" defaultValue={q} placeholder="搜索 SOP 名称或介绍" controlSize="lg" />
        </form>
      </ModulePageHeader>

      <section className="mt-16 md:mt-20">
        {sops.map((sop) => (
          <SopCard key={sop.id} sop={sop} />
        ))}
        {!sops.length ? <p className="border-b border-foreground/[0.08] py-12 text-muted-foreground">暂无匹配的标准 SOP。</p> : null}
      </section>
    </main>
  );
}
