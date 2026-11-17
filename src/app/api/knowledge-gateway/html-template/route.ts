import { getHtmlTemplateBundle } from "@/services/htmlTemplateBundleService";
import { assertGatewayRequest, responseForGatewayError } from "../_shared";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const rejected = assertGatewayRequest(request); if (rejected) return rejected;
  const query = new URL(request.url).searchParams;
  try { return Response.json(await getHtmlTemplateBundle(query.get("path") ?? "", query.getAll("resource")), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return responseForGatewayError(error); }
}
