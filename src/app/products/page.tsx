import { ProductCard } from "@/components/product/ProductCard";
import { ModulePageHeader } from "@/components/layout/ModulePageHeader";
import { Input } from "@/components/ui/input";
import { productService } from "@/services/productService";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const products = await productService.getProducts(q);

  return (
    <main className="mx-auto max-w-7xl px-5 py-20 md:py-28">
      <ModulePageHeader eyebrow="Vibe Product" title="团队自研工具入口" description="集中管理可访问的产品、网页工具和 AI 辅助工作流。" count={products.length}>
        <form action="/products">
          <Input name="q" defaultValue={q} placeholder="搜索产品名称或介绍" controlSize="lg" />
        </form>
      </ModulePageHeader>

      <section className="mt-16 md:mt-20">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
        {!products.length ? <p className="border-b border-foreground/[0.08] py-12 text-muted-foreground">暂无匹配的产品资产。</p> : null}
      </section>
    </main>
  );
}
