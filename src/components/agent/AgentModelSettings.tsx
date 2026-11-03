export function AgentModelSettings() {
  return (
    <section className="flex h-[calc(100dvh-4.5rem)] min-h-[32rem] flex-col">
      <div className="border-b border-border px-5 py-3">
        <h1 className="font-bold">模型设置</h1>
        <p className="text-sm text-muted-foreground">在下方工作台打开「设置 → 模型」，使用内置的提供方、模型和连接配置。配置保存在服务器，新建会话可选择已配置模型。</p>
      </div>
      <iframe title="Agent 内置模型设置工作台" src="/agent-runtime/" className="min-h-0 w-full flex-1 border-0" />
    </section>
  );
}
