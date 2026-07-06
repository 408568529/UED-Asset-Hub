import Link from "next/link";
import type { AssetVersion, AssetVersionType } from "@/types/audit";

export function VersionList({ versions, assetType }: { versions: AssetVersion[]; assetType: AssetVersionType }) {
  const filtered = versions.filter((version) => version.assetType === assetType);

  if (!filtered.length) {
    return <p className="border-t border-foreground/10 py-8 text-muted-foreground">暂无版本记录。</p>;
  }

  return (
    <div className="border-t border-foreground/10">
      {filtered.map((version) => (
        <article key={version.id} className="border-b border-foreground/10 py-7">
          <p className="font-mono text-xs text-muted-foreground">{version.createdAt.slice(0, 10)} · {version.operator}</p>
          <h2 className="mt-3 text-2xl font-black">{version.title} {version.version}</h2>
          <ul className="mt-4 space-y-2 text-sm leading-6">
            {version.changeSummary.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
          <Link href={`/admin/assets/${version.assetId}/versions/${version.id}`} className="mt-5 inline-block text-sm font-bold underline">
            查看版本详情
          </Link>
        </article>
      ))}
    </div>
  );
}
