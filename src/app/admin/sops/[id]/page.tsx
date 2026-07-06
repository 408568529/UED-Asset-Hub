import { notFound } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SopForm } from "@/components/admin/SopForm";
import { sopService } from "@/services/sopService";

export default async function EditSopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sop = await sopService.getSopById(decodeURIComponent(id));
  if (!sop) notFound();

  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Edit SOP</p>
        <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">编辑标准 SOP</h1>
        <SopForm sop={sop} />
      </main>
    </AdminGuard>
  );
}
