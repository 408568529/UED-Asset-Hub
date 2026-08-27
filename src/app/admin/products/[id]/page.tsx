import { notFound } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { ProductForm } from "@/components/admin/ProductForm";
import { productService } from "@/services/productService";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await productService.getProductById(decodeURIComponent(id));
  if (!product) notFound();

  return (
    <AdminGuard>
      <AdminPageFrame title="编辑 Vibe Product" contentLayout="form"><ProductForm product={product} /></AdminPageFrame>
    </AdminGuard>
  );
}
