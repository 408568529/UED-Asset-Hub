import Link from "next/link";
import { microStore } from "@/services/microStandardService";
import { MicroStandardsWorkspace } from "@/components/micro-standards/MicroStandardsWorkspace";
import { MarkdownKnowledgeForm } from "@/components/knowledge/MarkdownKnowledgeForm";
import { KnowledgeWorkspaceDetail } from "@/components/knowledge/KnowledgeWorkspaceDetail";
import { adaptMarkdownKnowledge } from "@/services/markdownKnowledgeAdapter";
import { AdminGuard } from "@/components/admin/AdminGuard";
export const dynamic = "force-dynamic";
export default async function MicroStandardsPage({ searchParams }: { searchParams: Promise<{ topic?: string; asset?: string; edit?: string }> }) {
  const params = await searchParams;
  const result = await microStore().list();
  const doc = params.asset || (params.edit && params.edit !== "new") ? await microStore().get(params.asset || params.edit!) : null;
  return <MicroStandardsWorkspace topics={result.topics} documents={result.documents} topic={params.topic} detail={Boolean(params.asset)}>{params.edit ? <AdminGuard><div className="mb-6"><Link className="text-sm text-muted-foreground" href="/micro-standards">← 返回微规范</Link><h1 className="my-5 text-xl font-bold">{params.edit === "new" ? "新建微规范" : "编辑微规范"}</h1></div>{params.edit !== "new" && !doc ? <p>未找到该规范。</p> : <MarkdownKnowledgeForm key={params.edit} documentType="micro-spec" document={doc || undefined} returnHref="/micro-standards"/>}</AdminGuard> : params.asset ? doc ? <KnowledgeWorkspaceDetail detail={{ kind: "markdown", asset: adaptMarkdownKnowledge(doc.metadata), item: doc }} backHref="/micro-standards"/> : <p>未找到该规范，原数据未被替换。</p> : undefined}</MicroStandardsWorkspace>;
}
