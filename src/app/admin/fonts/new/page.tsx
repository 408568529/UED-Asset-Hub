import { AdminGuard } from "@/components/admin/AdminGuard";
import { FontForm } from "@/components/admin/FontForm";

export default function NewFontPage() {
  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">New Font</p>
        <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">新建 Font Library</h1>
        <FontForm />
      </main>
    </AdminGuard>
  );
}
