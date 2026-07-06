import { ProductCard } from "@/components/product/ProductCard";
import { Input } from "@/components/ui/input";
import { productService } from "@/services/productService";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const products = await productService.getProducts(q);

  return (
    <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
      <div className="grid gap-8 md:grid-cols-[1fr_360px] md:items-end">
        <div>
          <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Vibe Product</p>
          <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">团队自研工具入口</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">集中管理可访问的产品、网页工具和 AI 辅助工作流。</p>
        </div>
        <form action="/products" className="rounded-full border border-foreground/15 bg-white p-2">
          <Input name="q" defaultValue={q} placeholder="搜索产品名称或介绍" className="border-0 bg-transparent focus:ring-0" />
        </form>
      </div>

      <section className="mt-14">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </section>
    </main>
  );
}
