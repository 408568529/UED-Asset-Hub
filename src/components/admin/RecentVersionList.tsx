import Link from "next/link";
import type { AssetVersion } from "@/types/audit";

export function RecentVersionList({ versions }: { versions: AssetVersion[] }) {
  if (!versions.length) {
    return <p className="border-t border-foreground/10 py-8 text-muted-foreground">暂无版本记录。</p>;
  }

  return (
    <div className="border-t border-foreground/10">
      {versions.map((version) => (
        <article key={version.id} className="border-b border-foreground/10 py-7">
          <p className="font-mono text-xs text-muted-foreground">{version.createdAt.slice(0, 10)} · {version.assetType}</p>
          <h2 className="mt-3 text-2xl font-black">{version.title} {version.version}</h2>
          <Link href={`/admin/assets/${version.assetId}/versions/${version.id}`} className="mt-4 inline-block text-sm font-bold underline">
            查看详情
          </Link>
        </article>
      ))}
    </div>
  );
}
