import { redirect } from "next/navigation";

export default async function LegacyEditComponentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/components/${id}`);
}
