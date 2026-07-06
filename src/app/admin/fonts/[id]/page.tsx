import { notFound } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { FontForm } from "@/components/admin/FontForm";
import { fontService } from "@/services/fontService";

export default async function EditFontPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const font = await fontService.getFontById(decodeURIComponent(id));
  if (!font) notFound();

  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Edit Font</p>
        <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">编辑 Font Library</h1>
        <FontForm font={font} />
      </main>
    </AdminGuard>
  );
}
