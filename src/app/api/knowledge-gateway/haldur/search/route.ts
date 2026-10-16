import { haldurKnowledgeService } from "@/services/haldurKnowledgeService";
import { assertGatewayRequest, readLimit, responseForGatewayError } from "../../_shared";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const rejected = assertGatewayRequest(request);
  if (rejected) return rejected;
  try {
    const params = new URL(request.url).searchParams;
    return Response.json(await haldurKnowledgeService.search({ q: params.get("q") ?? undefined, prefix: params.get("prefix") ?? undefined, limit: readLimit(params) }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return responseForGatewayError(error); }
}
