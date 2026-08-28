import { knowledgeGatewayService } from "@/services/knowledgeGatewayService";
import type { MarkdownKnowledgeRelatedScope, MarkdownKnowledgeSpecTopic } from "@/types/markdownKnowledge";
import { assertGatewayRequest, readLimit, responseForGatewayError } from "../../_shared";

export async function GET(request: Request) {
  const rejected = assertGatewayRequest(request);
  if (rejected) return rejected;
  try {
    const params = new URL(request.url).searchParams;
    return Response.json(await knowledgeGatewayService.searchMicroSpecs({ q: params.get("q") ?? undefined, relatedScopes: params.getAll("relatedScope") as MarkdownKnowledgeRelatedScope[], specTopics: params.getAll("specTopic") as MarkdownKnowledgeSpecTopic[], tags: params.getAll("tag"), limit: readLimit(params) }));
  } catch (error) {
    return responseForGatewayError(error);
  }
}
