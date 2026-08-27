import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { ProductForm } from "@/components/admin/ProductForm";

export default function NewProductPage() {
  return (
    <AdminGuard>
      <AdminPageFrame title="新建 Vibe Product" contentLayout="form"><ProductForm /></AdminPageFrame>
    </AdminGuard>
  );
}
