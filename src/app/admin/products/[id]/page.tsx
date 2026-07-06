import { notFound } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { ProductForm } from "@/components/admin/ProductForm";
import { productService } from "@/services/productService";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await productService.getProductById(decodeURIComponent(id));
  if (!product) notFound();

  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Edit Product</p>
        <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">编辑 Vibe Product</h1>
        <ProductForm product={product} />
      </main>
    </AdminGuard>
  );
}
