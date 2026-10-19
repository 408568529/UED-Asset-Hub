import Link from "next/link";
import { Button } from "@/components/ui/button";
import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";

export default function NotFound() {
  return <main className="workspace-not-found"><WorkspacePageHeader title="内容未找到" description="该内容可能已移除，或当前链接不正确。" /><div className="mt-6 flex flex-wrap gap-3"><Button asChild><Link href="/knowledge">返回知识库</Link></Button><Button asChild variant="outline"><Link href="/">返回首页</Link></Button></div></main>;
}
