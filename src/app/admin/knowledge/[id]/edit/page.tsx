import { notFound } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { KnowledgeAuthoringWorkspace } from "@/components/knowledge/KnowledgeAuthoringWorkspace";
import { MarkdownKnowledgeForm } from "@/components/knowledge/MarkdownKnowledgeForm";
import { getKnowledgeReturnHref } from "@/lib/knowledgeNavigation";
import { markdownKnowledgeService } from "@/services/markdownKnowledgeService";

export default async function EditMarkdownKnowledgePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const { id } = await params;
  const returnHref = getKnowledgeReturnHref((await searchParams).returnTo);
  const document = await markdownKnowledgeService.getById(decodeURIComponent(id)).catch(() => null);
  if (!document) notFound();
  return (
    <AdminGuard>
      <KnowledgeAuthoringWorkspace title={document.metadata.documentType === "micro-spec" ? "编辑微规范" : document.metadata.documentType === "project" ? "编辑项目沉淀" : "编辑知识文章"} description="源码视图保持只读；请在此编辑 Markdown 正文。" returnHref={returnHref}>
        <MarkdownKnowledgeForm documentType={document.metadata.documentType} document={document} returnHref={returnHref} />
      </KnowledgeAuthoringWorkspace>
    </AdminGuard>
  );
}
