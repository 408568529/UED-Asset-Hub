import { AdminGuard } from "@/components/admin/AdminGuard";
import { SopForm } from "@/components/admin/SopForm";

export default function NewSopPage() {
  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">New SOP</p>
        <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">新建标准 SOP</h1>
        <SopForm />
      </main>
    </AdminGuard>
  );
}
