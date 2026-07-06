import { notFound } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { ComponentSpecForm } from "@/components/admin/ComponentSpecForm";
import { componentSpecService } from "@/services/componentSpecService";

export default async function EditComponentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const component = await componentSpecService.getComponentById(decodeURIComponent(id));
  if (!component) notFound();

  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Edit Component</p>
        <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">编辑组件规范</h1>
        <ComponentSpecForm component={component} />
      </main>
    </AdminGuard>
  );
}
