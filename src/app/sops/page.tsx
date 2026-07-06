import { SopCard } from "@/components/sop/SopCard";
import { Input } from "@/components/ui/input";
import { sopService } from "@/services/sopService";

export default async function SopsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const sops = await sopService.getSops(q);

  return (
    <main className="mx-auto max-w-7xl px-5 py-20 md:py-28">
      <div className="grid gap-8 md:grid-cols-[1fr_360px] md:items-end">
        <div>
          <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Standard SOP</p>
          <h1 className="mt-6 max-w-5xl text-2xl font-black leading-tight md:text-3xl">标准流程资产库</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">集中管理设计走查、交付协作、评审验收等标准流程。</p>
        </div>
        <form action="/sops" className="bg-white p-1 shadow-[0_18px_60px_rgba(0,0,0,0.05)]">
          <Input name="q" defaultValue={q} placeholder="搜索 SOP 名称或介绍" className="border-0 bg-transparent focus:ring-0" />
        </form>
      </div>

      <section className="mt-24">
        {sops.map((sop) => (
          <SopCard key={sop.id} sop={sop} />
        ))}
      </section>
    </main>
  );
}
