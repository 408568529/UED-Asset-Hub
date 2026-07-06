import type { UploadRecord } from "@/types/audit";

export function UploadRecordList({ uploads }: { uploads: UploadRecord[] }) {
  if (!uploads.length) {
    return <p className="border-t border-foreground/10 py-8 text-muted-foreground">暂无上传记录。</p>;
  }

  return (
    <div className="border-t border-foreground/10">
      {uploads.map((upload) => (
        <article key={upload.id} className="border-b border-foreground/10 py-7">
          <p className="font-mono text-xs text-muted-foreground">{upload.uploadedAt.slice(0, 10)} · {upload.operator}</p>
          <h2 className="mt-3 text-2xl font-black">{upload.fileName}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {upload.fileType} · {upload.status} {upload.assetModule ? `· ${upload.assetModule}` : ""} {upload.relatedAssetName ? `· ${upload.relatedAssetName}` : ""}
          </p>
          {upload.summary ? <p className="mt-4 text-sm leading-6">{upload.summary}</p> : null}
        </article>
      ))}
    </div>
  );
}
