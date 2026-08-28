import { knowledgeGatewayService } from "@/services/knowledgeGatewayService";
import { assertGatewayRequest, responseForGatewayError } from "../../../_shared";

export async function GET(request: Request, context: { params: Promise<{ assetType: string; id: string }> }) {
  const rejected = assertGatewayRequest(request);
  if (rejected) return rejected;
  try {
    const { assetType, id } = await context.params;
    return Response.json(await knowledgeGatewayService.getAsset(assetType, id));
  } catch (error) {
    return responseForGatewayError(error);
  }
}
