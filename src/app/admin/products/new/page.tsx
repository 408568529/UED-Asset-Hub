import { AdminGuard } from "@/components/admin/AdminGuard";
import { ProductForm } from "@/components/admin/ProductForm";

export default function NewProductPage() {
  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">New Product</p>
        <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">新建 Vibe Product</h1>
        <ProductForm />
      </main>
    </AdminGuard>
  );
}
