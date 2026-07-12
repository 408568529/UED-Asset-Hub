import Image from "next/image";
import Link from "next/link";
import { FolderOpen } from "lucide-react";
import type { TrainingFolder } from "@/types/training";

export function TrainingFolderCard({ folder }: { folder: TrainingFolder }) {
  const tone = [
    "bg-[hsl(var(--folder-tone-1))]",
    "bg-[hsl(var(--folder-tone-2))]",
    "bg-[hsl(var(--folder-tone-3))]",
    "bg-[hsl(var(--folder-tone-4))]"
  ][folder.name.split("").reduce((sum, character) => sum + character.charCodeAt(0), 0) % 4];

  return (
    <Link href={`/training/groups/${folder.id}`} className="group block border border-border bg-white/35 transition-colors hover:border-foreground/50">
      <div className={`relative aspect-[4/3] overflow-hidden ${tone}`}>
        {folder.coverVideoId ? (
          <Image src={`/api/training/videos/${folder.coverVideoId}/cover`} alt="" fill unoptimized sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover transition duration-500 group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full flex-col justify-between p-6 md:p-7">
            <span className="inline-flex h-12 w-12 items-center justify-center border border-foreground/15 bg-white/65 transition-transform group-hover:translate-x-1">
              <FolderOpen size={25} strokeWidth={1.5} />
            </span>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Training Folder</p>
              <h2 className="mt-3 line-clamp-3 text-2xl font-black leading-tight">{folder.name}</h2>
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto] items-end gap-4 border-t border-border px-5 py-4">
        <div className="min-w-0">
          {folder.coverVideoId ? <h2 className="truncate text-lg font-black" title={folder.name}>{folder.name}</h2> : null}
          <p className={`${folder.coverVideoId ? "mt-1" : ""} font-mono text-xs text-muted-foreground`}>{folder.videoCount} 个视频</p>
        </div>
        <span className="font-mono text-xs text-muted-foreground">{folder.updatedAt.slice(0, 10)}</span>
      </div>
    </Link>
  );
}
