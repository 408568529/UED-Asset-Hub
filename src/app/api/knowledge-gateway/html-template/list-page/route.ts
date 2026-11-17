import { getListPageTemplateBundle } from "@/services/htmlTemplateBundleService";
import { assertGatewayRequest, responseForGatewayError } from "../../_shared";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const rejected = assertGatewayRequest(request);
  if (rejected) return rejected;
  try { return Response.json(await getListPageTemplateBundle(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return responseForGatewayError(error); }
}
