import { notFound } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { SopForm } from "@/components/admin/SopForm";
import { sopService } from "@/services/sopService";

export default async function EditSopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sop = await sopService.getSopById(decodeURIComponent(id));
  if (!sop) notFound();

  return (
    <AdminGuard>
      <AdminPageFrame title="编辑标准 SOP"><SopForm sop={sop} /></AdminPageFrame>
    </AdminGuard>
  );
}
