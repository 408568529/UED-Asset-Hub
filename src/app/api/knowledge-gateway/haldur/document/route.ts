import { haldurKnowledgeService } from "@/services/haldurKnowledgeService";
import { assertGatewayRequest, responseForGatewayError } from "../../_shared";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const rejected = assertGatewayRequest(request);
  if (rejected) return rejected;
  try {
    const params = new URL(request.url).searchParams;
    return Response.json(await haldurKnowledgeService.get({ path: params.get("path") ?? "", offset: params.has("offset") ? Number(params.get("offset")) : undefined, sha256: params.get("sha256") ?? undefined }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return responseForGatewayError(error); }
}
