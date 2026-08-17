import { AgentAdapterError, dshRuntimeAdapter } from "@/agent-integration/adapter/dshRuntimeAdapter";
import { isAdminRequest } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return new Response("Unauthorized", { status: 401 });
  try {
    return new Response(dshRuntimeAdapter.getEventStream(request.signal), {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform"
      }
    });
  } catch (error) {
    const message = error instanceof AgentAdapterError ? error.message : "Agent 服务暂时不可用。";
    return new Response(message, { status: 502 });
  }
}
