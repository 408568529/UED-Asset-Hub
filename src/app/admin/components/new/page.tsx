import { AdminGuard } from "@/components/admin/AdminGuard";
import { ComponentSpecForm } from "@/components/admin/ComponentSpecForm";

export default function NewComponentPage() {
  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">New Component</p>
        <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">新建组件规范</h1>
        <ComponentSpecForm />
      </main>
    </AdminGuard>
  );
}
