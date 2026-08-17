import { Bot, FolderCog, ShieldCheck } from "lucide-react";
import { AgentRuntimePanel } from "@/components/agent/AgentRuntimePanel";
import { AgentSessionWorkspace } from "@/components/agent/AgentSessionWorkspace";

export function AgentShell() {
  return (
    <main className="page-frame">
      <div className="page-shell">
        <p className="section-kicker">Youding Agent / P0 Foundation</p>
        <div className="mt-5 grid gap-8 border-b border-border pb-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
          <div>
            <h1 className="max-w-4xl text-4xl font-black leading-[0.98] tracking-tight md:text-6xl">悠鼎 Agent</h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground">在 Asset Hub 内进入团队 AI 工作空间。会话、工作目录和 Agent 运行数据保持在独立外置目录，正式资产数据不会被读取或改写。</p>
          </div>
          <div className="border-l border-border pl-5 text-sm leading-7 text-muted-foreground">
            <p>当前阶段：入口与运行时连接</p>
            <p>访问范围：管理员 / 授权用户</p>
          </div>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div>
            <AgentRuntimePanel />
            <section className="mt-8 border-y border-border py-8">
              <div className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-foreground bg-foreground text-white"><Bot size={19} /></span>
                <div>
                  <h2 className="text-xl font-black">Agent 对话工作区</h2>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">DSH 原生会话、工具调用与流式界面将在下一小阶段以独立 Surface 接入。当前不将 DSH 原始导航、登录或 API 直接暴露到局域网。</p>
                </div>
              </div>
            </section>
            <AgentSessionWorkspace />
          </div>

          <aside className="border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <FolderCog size={20} />
            <h2 className="mt-4 text-lg font-black">数据边界</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">Workspace、Session、附件与后续 Artifact 使用独立 `agent-data` 目录。Asset Hub 的 `DATA_DIR` 保持只服务正式资产。</p>
            <div className="mt-6 flex items-center gap-2 text-xs font-bold text-muted-foreground"><ShieldCheck size={15} className="text-primary" /> DSH 仅监听本机回环地址</div>
          </aside>
        </div>
      </div>
    </main>
  );
}
