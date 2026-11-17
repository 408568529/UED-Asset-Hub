import { listHtmlTemplates } from "@/services/htmlTemplateBundleService";
import { assertGatewayRequest, responseForGatewayError } from "../../_shared";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const rejected = assertGatewayRequest(request); if (rejected) return rejected;
  const query = new URL(request.url).searchParams;
  try { return Response.json(await listHtmlTemplates({ q: query.get("q") ?? "", offset: Number(query.get("offset") ?? 0), limit: Number(query.get("limit") ?? 50) }), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return responseForGatewayError(error); }
}
