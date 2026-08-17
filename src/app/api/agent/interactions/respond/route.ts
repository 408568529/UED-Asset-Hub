import { NextResponse } from "next/server";
import { AgentAdapterError, dshRuntimeAdapter } from "@/agent-integration/adapter/dshRuntimeAdapter";
import { isAdminRequest } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

function responseError(error: unknown) {
  return NextResponse.json({ message: error instanceof AgentAdapterError ? error.message : "Agent 服务暂时不可用。" }, { status: 502 });
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json() as Record<string, unknown>;
    if (!isText(body.rpcId) || !isText(body.sessionId)) return NextResponse.json({ message: "缺少有效的交互标识。" }, { status: 400 });
    const rpcId = body.rpcId.trim();
    const sessionId = body.sessionId.trim();

    if (body.kind === "approval") {
      if (!isText(body.approvalId) || (body.outcome !== "allowed-once" && body.outcome !== "rejected")) {
        return NextResponse.json({ message: "审批结果无效。" }, { status: 400 });
      }
      await dshRuntimeAdapter.respondToApproval({
        rpcId,
        sessionId,
        approvalId: body.approvalId.trim(),
        outcome: body.outcome
      });
      return NextResponse.json({ accepted: true });
    }

    if (body.kind === "question" && Array.isArray(body.answers)) {
      const answers = [];
      for (const answer of body.answers) {
        if (!answer || typeof answer !== "object") return NextResponse.json({ message: "补充信息格式无效。" }, { status: 400 });
        const item = answer as Record<string, unknown>;
        if (!isText(item.id) || !Array.isArray(item.selected) || !item.selected.every((value) => typeof value === "string")) {
          return NextResponse.json({ message: "补充信息格式无效。" }, { status: 400 });
        }
        const custom = typeof item.custom === "string" ? item.custom.trim() : undefined;
        if (typeof item.custom !== "undefined" && !custom) return NextResponse.json({ message: "补充内容不能为空。" }, { status: 400 });
        answers.push({ id: item.id.trim(), selected: item.selected, ...(custom ? { custom } : {}) });
      }
      await dshRuntimeAdapter.respondToQuestions({ rpcId, sessionId, answers });
      return NextResponse.json({ accepted: true });
    }

    return NextResponse.json({ message: "未知的交互类型。" }, { status: 400 });
  } catch (error) {
    return responseError(error);
  }
}
