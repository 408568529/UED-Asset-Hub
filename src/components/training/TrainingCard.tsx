import Link from "next/link";
import Image from "next/image";
import { Play } from "lucide-react";
import { TrainingRating } from "@/components/training/TrainingRating";
import type { TrainingVideo } from "@/types/training";

export function formatDuration(seconds: number) {
  if (!seconds) return "时长待补充";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}` : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function TrainingCard({ video }: { video: TrainingVideo }) {
  return (
    <Link href={`/training/${video.id}`} className="group block border border-border bg-[hsl(var(--surface))] shadow-[var(--shadow-soft)] transition-[border-color,transform] hover:-translate-y-0.5 hover:border-[hsl(var(--border-strong))]">
      <div className="relative aspect-video overflow-hidden bg-[hsl(var(--surface-subtle))] text-foreground">
        {video.coverPath ? <Image src={`/api/training/videos/${video.id}/cover`} alt="" fill unoptimized sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" /> : (
          <div className="flex h-full flex-col justify-between p-6">
            <div className="flex items-start justify-between"><p className="section-kicker">{video.groupName}</p><span className="h-9 w-9 border border-foreground/15 bg-[hsl(var(--surface)/0.7)]" /></div>
            <p className="line-clamp-2 text-2xl font-black leading-tight tracking-[-0.02em]">{video.title}</p>
          </div>
        )}
        <span className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center bg-primary text-foreground"><Play size={18} fill="currentColor" /></span>
      </div>
      <div className="p-5">
        <p className="font-mono text-xs text-muted-foreground">{video.groupName}</p>
        <h3 className="mt-3 min-h-[2.5em] line-clamp-2 text-xl font-black leading-tight">{video.title}</h3>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground"><span>{formatDuration(video.duration)}</span>{video.speaker ? <span>{video.speaker}</span> : null}<span>{video.playCount} 次播放</span><TrainingRating rating={video.rating} /></div>
      </div>
    </Link>
  );
}
