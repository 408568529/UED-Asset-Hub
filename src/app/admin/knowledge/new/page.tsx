import { AdminGuard } from "@/components/admin/AdminGuard";
import { KnowledgeAuthoringWorkspace } from "@/components/knowledge/KnowledgeAuthoringWorkspace";
import { MarkdownKnowledgeForm } from "@/components/knowledge/MarkdownKnowledgeForm";
import { getKnowledgeReturnHref } from "@/lib/knowledgeNavigation";
import { markdownKnowledgeDocumentTypes, type MarkdownKnowledgeDocumentType } from "@/types/markdownKnowledge";

const titles: Record<MarkdownKnowledgeDocumentType, string> = {
  knowledge: "新建知识文章",
  project: "新建项目沉淀",
  "micro-spec": "新建微规范"
};

export default async function NewMarkdownKnowledgePage({ searchParams }: { searchParams: Promise<{ type?: string; returnTo?: string }> }) {
  const params = await searchParams;
  const value = params.type;
  const documentType = markdownKnowledgeDocumentTypes.includes(value as MarkdownKnowledgeDocumentType) ? value as MarkdownKnowledgeDocumentType : "knowledge";
  const returnHref = getKnowledgeReturnHref(params.returnTo);
  return (
    <AdminGuard>
      <KnowledgeAuthoringWorkspace title={titles[documentType]} description="内容将保存到 DATA_DIR/knowledge，并进入 Knowledge Library。" returnHref={returnHref}>
        <MarkdownKnowledgeForm documentType={documentType} returnHref={returnHref} />
      </KnowledgeAuthoringWorkspace>
    </AdminGuard>
  );
}
