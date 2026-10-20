"use client";
import { useEffect, useState } from "react";
import { Button } from "antd";
import { Download, Pencil } from "lucide-react";
import { isAdminLoggedIn } from "@/lib/adminSession";
export function MicroStandardActions({ id }: { id: string }) {
  const [admin, setAdmin] = useState(false);
  useEffect(() => { void isAdminLoggedIn().then(setAdmin); }, []);
  return <div className="flex gap-2"><Button href={`/api/micro-standards/${encodeURIComponent(id)}?download=1`} icon={<Download size={15}/>}>下载 Markdown</Button>{admin ? <Button href={`/micro-standards?edit=${encodeURIComponent(id)}`} icon={<Pencil size={15}/>}>编辑 Markdown</Button> : null}</div>;
}
