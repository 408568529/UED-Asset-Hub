import { ComponentSpecCard } from "@/components/componentSpec/ComponentSpecCard";
import { ModulePageHeader } from "@/components/layout/ModulePageHeader";
import { Input } from "@/components/ui/input";
import { componentSpecService } from "@/services/componentSpecService";

export default async function ComponentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const components = await componentSpecService.getComponents(q);

  return (
    <main className="mx-auto max-w-7xl px-5 py-20 md:py-28">
      <ModulePageHeader eyebrow="Component Specs" title="组件规范资产库" description="集中管理组件规范、设计文件和规范文档链接。" count={components.length}>
        <form action="/components">
          <Input name="q" defaultValue={q} placeholder="搜索组件名称或介绍" controlSize="lg" />
        </form>
      </ModulePageHeader>

      <section className="mt-16 md:mt-20">
        {components.map((component) => (
          <ComponentSpecCard key={component.id} component={component} />
        ))}
        {!components.length ? <p className="border-b border-foreground/[0.08] py-12 text-muted-foreground">暂无匹配的组件规范。</p> : null}
      </section>
    </main>
  );
}
