import { ComponentSpecCard } from "@/components/componentSpec/ComponentSpecCard";
import { Input } from "@/components/ui/input";
import { componentSpecService } from "@/services/componentSpecService";

export default async function ComponentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const components = await componentSpecService.getComponents(q);

  return (
    <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
      <div className="grid gap-8 md:grid-cols-[1fr_360px] md:items-end">
        <div>
          <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Component Specs</p>
          <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">组件规范资产库</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">集中管理组件规范、设计文件和规范文档链接。</p>
        </div>
        <form action="/components" className="rounded-full border border-foreground/15 bg-white p-2">
          <Input name="q" defaultValue={q} placeholder="搜索组件名称或介绍" className="border-0 bg-transparent focus:ring-0" />
        </form>
      </div>

      <section className="mt-14">
        {components.map((component) => (
          <ComponentSpecCard key={component.id} component={component} />
        ))}
      </section>
    </main>
  );
}
