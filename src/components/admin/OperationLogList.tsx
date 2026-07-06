import type { OperationLog } from "@/types/audit";

export function OperationLogList({ logs }: { logs: OperationLog[] }) {
  if (!logs.length) {
    return <p className="border-t border-foreground/10 py-8 text-muted-foreground">暂无更新日志。</p>;
  }

  return (
    <div className="border-t border-foreground/10">
      {logs.map((log) => (
        <article key={log.id} className="border-b border-foreground/10 py-7">
          <p className="font-mono text-xs text-muted-foreground">{log.createdAt.slice(0, 10)} · {log.operator}</p>
          <h2 className="mt-3 text-2xl font-black">{log.title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{log.description}</p>
          {log.diffSummary?.length ? (
            <ul className="mt-4 space-y-2 text-sm leading-6">
              {log.diffSummary.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          ) : null}
        </article>
      ))}
    </div>
  );
}
