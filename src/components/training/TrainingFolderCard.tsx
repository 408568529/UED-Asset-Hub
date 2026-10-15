import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, FolderOpen } from "lucide-react";
import type { TrainingFolder } from "@/types/training";

export function TrainingFolderCard({ folder }: { folder: TrainingFolder }) {
  const tone = [
    "bg-[hsl(var(--folder-tone-1))]",
    "bg-[hsl(var(--folder-tone-2))]",
    "bg-[hsl(var(--folder-tone-3))]",
    "bg-[hsl(var(--folder-tone-4))]"
  ][folder.name.split("").reduce((sum, character) => sum + character.charCodeAt(0), 0) % 4];

  return (
    <Link href={`/training/groups/${folder.id}`} className="group block border border-border bg-[hsl(var(--surface))] shadow-[var(--shadow-soft)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[hsl(var(--border-strong))] hover:shadow-[var(--shadow-raised)]">
      <div className={`relative aspect-[16/10] overflow-hidden border-b border-border ${tone}`}>
        {folder.coverVideoId ? (
          <Image src={`/api/training/videos/${folder.coverVideoId}/cover`} alt="" fill unoptimized sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover transition duration-500 group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full flex-col justify-between p-6 md:p-7">
            <div className="flex items-start justify-between">
              <span className="inline-flex h-11 w-11 items-center justify-center border border-foreground/15 bg-[hsl(var(--surface)/0.72)] transition-transform group-hover:translate-x-1">
                <FolderOpen size={22} strokeWidth={1.5} />
              </span>
              <span className="font-mono text-5xl font-black text-foreground/10">{String(folder.videoCount).padStart(2, "0")}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] items-end gap-5">
              <div><p className="section-kicker">Training folder</p><h2 className="mt-2 line-clamp-2 text-2xl font-black leading-tight tracking-[-0.02em]">{folder.name}</h2></div>
              <span className="grid h-9 w-9 place-items-center border border-foreground/15 bg-[hsl(var(--surface)/0.72)]"><ArrowUpRight size={16} /></span>
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto] items-end gap-4 px-5 py-4">
        <div className="min-w-0">
          {folder.coverVideoId ? <h2 className="truncate text-lg font-black" title={folder.name}>{folder.name}</h2> : null}
          <p className={`${folder.coverVideoId ? "mt-1" : ""} font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground`}>{folder.videoCount} 个视频</p>
        </div>
        <span className="font-mono text-xs text-muted-foreground">{folder.updatedAt.slice(0, 10)}</span>
      </div>
    </Link>
  );
}
