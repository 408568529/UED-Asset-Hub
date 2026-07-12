import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Product } from "@/types/product";

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="border-b border-foreground/[0.08] py-9 transition-colors hover:bg-white/65 md:-mx-6 md:px-6">
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div>
          <p className="font-mono text-xs text-muted-foreground">Updated {product.updatedAt.slice(0, 10)}</p>
          <h2 className="mt-4 text-2xl font-black leading-tight">{product.name}</h2>
          <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">{product.description}</p>
        </div>
        <Button asChild variant="secondary">
          <a href={product.link} target="_blank" rel="noreferrer">
            打开产品
            <ArrowUpRight size={16} />
          </a>
        </Button>
      </div>
    </article>
  );
}
