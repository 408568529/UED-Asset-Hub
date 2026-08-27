import { notFound } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { ComponentSpecForm } from "@/components/admin/ComponentSpecForm";
import { componentSpecService } from "@/services/componentSpecService";

export default async function EditComponentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const component = await componentSpecService.getComponentById(decodeURIComponent(id));
  if (!component) notFound();

  return (
    <AdminGuard>
      <AdminPageFrame title="编辑组件规范" contentLayout="form"><ComponentSpecForm component={component} /></AdminPageFrame>
    </AdminGuard>
  );
}
