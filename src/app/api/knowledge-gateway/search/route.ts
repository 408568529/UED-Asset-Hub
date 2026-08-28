import { knowledgeGatewayService } from "@/services/knowledgeGatewayService";
import { assertGatewayRequest, readAssetTypes, readLimit, responseForGatewayError } from "../_shared";

export async function GET(request: Request) {
  const rejected = assertGatewayRequest(request);
  if (rejected) return rejected;
  try {
    const params = new URL(request.url).searchParams;
    return Response.json(await knowledgeGatewayService.search({ q: params.get("q") ?? undefined, assetTypes: readAssetTypes(params), sections: params.getAll("section") as never, categories: params.getAll("category"), tags: params.getAll("tag"), limit: readLimit(params) }));
  } catch (error) {
    return responseForGatewayError(error);
  }
}
