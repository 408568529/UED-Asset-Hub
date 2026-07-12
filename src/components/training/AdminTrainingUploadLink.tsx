"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAdminLoggedIn } from "@/lib/adminSession";

export function AdminTrainingUploadLink({ folderId }: { folderId: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { void isAdminLoggedIn().then(setVisible); }, []);
  if (!visible) return null;
  return <Button asChild><Link href={`/admin/training/create?folderId=${folderId}`}><Plus size={16} />上传到此文件夹</Link></Button>;
}
