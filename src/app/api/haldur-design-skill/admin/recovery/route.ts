import { NextResponse } from "next/server";
import { hasHaldurCapability } from "@/lib/haldurPermissions";
import { haldurDesignSkillGovernanceService } from "@/services/haldurDesignSkillGovernanceService";
export async function GET(request: Request) { if (!hasHaldurCapability(request, "haldur.admin")) return NextResponse.json({ code: "PERMISSION_DENIED", message: "你没有执行此操作的权限。" }, { status: 403 }); return NextResponse.json(await haldurDesignSkillGovernanceService.recovery()); }
export async function POST(request: Request) { if (!hasHaldurCapability(request, "haldur.admin")) return NextResponse.json({ code: "PERMISSION_DENIED", message: "你没有执行此操作的权限。" }, { status: 403 }); const state = await haldurDesignSkillGovernanceService.recovery(); return NextResponse.json({ code: "RECOVERY_EVIDENCE_INSUFFICIENT", message: "当前恢复证据不足，需人工介入；系统不会猜测修改文件。", state }, { status: 409 }); }
