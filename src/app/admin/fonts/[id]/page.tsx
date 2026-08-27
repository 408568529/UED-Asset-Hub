import { notFound } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { FontForm } from "@/components/admin/FontForm";
import { fontService } from "@/services/fontService";

export default async function EditFontPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const font = await fontService.getFontById(decodeURIComponent(id));
  if (!font) notFound();

  return (
    <AdminGuard>
      <AdminPageFrame title="编辑 Font Library" contentLayout="form"><FontForm font={font} /></AdminPageFrame>
    </AdminGuard>
  );
}
