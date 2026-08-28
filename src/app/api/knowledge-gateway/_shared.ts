import { NextResponse } from "next/server";
import { assertAgentGatewayConfigured, isAgentGatewayAuthorized } from "@/lib/agentGatewayAuth";
import { KnowledgeGatewayError, type KnowledgeGatewayAssetType } from "@/types/knowledgeGateway";

export function assertGatewayRequest(request: Request) {
  try {
    assertAgentGatewayConfigured();
  } catch {
    return NextResponse.json({ error: { code: "gateway-not-configured", message: "Knowledge Gateway is not configured." } }, { status: 503 });
  }
  if (!isAgentGatewayAuthorized(request)) return NextResponse.json({ error: { code: "unauthorized", message: "Knowledge Gateway authorization failed." } }, { status: 401 });
  return null;
}

export function responseForGatewayError(error: unknown) {
  if (error instanceof KnowledgeGatewayError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  console.error("Knowledge Gateway request failed", error);
  return NextResponse.json({ error: { code: "gateway-unavailable", message: "Knowledge Gateway is temporarily unavailable." } }, { status: 503 });
}

export function readAssetTypes(params: URLSearchParams): KnowledgeGatewayAssetType[] | undefined {
  const values = params.getAll("assetType");
  const accepted: KnowledgeGatewayAssetType[] = ["knowledge", "sop", "component-spec", "micro-spec", "project", "prompt", "skill", "training", "vibe-product", "font"];
  if (values.some((value) => !accepted.includes(value as KnowledgeGatewayAssetType))) throw new KnowledgeGatewayError("invalid-asset-type", 400, "assetType 不受 Knowledge Gateway 支持。");
  return values.length ? values as KnowledgeGatewayAssetType[] : undefined;
}

export function readLimit(params: URLSearchParams) {
  const raw = params.get("limit");
  if (raw === null) return undefined;
  if (!/^\d+$/.test(raw)) throw new KnowledgeGatewayError("invalid-limit", 400, "limit 必须是整数。");
  return Number(raw);
}
