import { notFound } from "next/navigation";
import { AssetDetailHeader } from "@/components/layout/AssetDetailHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FontPreview } from "@/components/font/FontPreview";
import { fontService } from "@/services/fontService";

export default async function FontDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const font = await fontService.getFontById(decodeURIComponent(id));
  if (!font) notFound();
  const versions = await fontService.getFontVersions(font.id);

  return (
    <main className="page-shell page-frame">
      <AssetDetailHeader
        eyebrow="Font Library"
        marker="Aa"
        title={font.name}
        description={font.description}
        meta={<><p>Designer · <strong className="text-foreground">{font.designer || "未填写"}</strong></p><p>Version · {font.version}</p><p>Format · {font.fileFormat}</p><p>{font.downloadCount} downloads</p></>}
        tags={<><Badge>{font.category}</Badge><Badge>{font.version}</Badge><Badge>{font.fileFormat}</Badge>{font.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</>}
        actions={<><Button asChild variant="secondary"><a href={`/api/fonts/${font.id}/download`}>下载字体</a></Button>{font.officialUrl ? <Button asChild variant="outline"><a href={font.officialUrl} target="_blank" rel="noreferrer">字体官网</a></Button> : null}</>}
      />
      <section className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <FontPreview font={font} />
        <aside className="detail-surface p-6 md:p-7">
          <p className="section-kicker">Metadata</p>
          <h2 className="mt-3 text-2xl font-black">字体信息</h2>
          <dl className="mt-5 space-y-4 text-sm leading-6">
            <div><dt className="font-bold">设计师</dt><dd className="text-muted-foreground">{font.designer || "未填写"}</dd></div>
            <div><dt className="font-bold">版权说明</dt><dd className="text-muted-foreground">{font.license || "未填写"}</dd></div>
            <div><dt className="font-bold">文件大小</dt><dd className="text-muted-foreground">{Math.round(font.fileSize / 1024)} KB</dd></div>
            <div><dt className="font-bold">下载次数</dt><dd className="text-muted-foreground">{font.downloadCount}</dd></div>
          </dl>
          <h2 className="mt-10 text-2xl font-black">Version History</h2>
          <div className="mt-5">
            {versions.map((version) => (
              <div key={version.id} className="border-b border-foreground/[0.08] py-5">
                <p className="font-bold">{version.version}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{version.fileName} · {Math.round(version.fileSize / 1024)} KB</p>
                <a className="mt-3 inline-block text-sm font-bold underline" href={`/api/fonts/${font.id}/download?versionId=${version.id}`}>下载该版本</a>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
