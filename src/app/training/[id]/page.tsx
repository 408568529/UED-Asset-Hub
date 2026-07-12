import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { TrainingCard, formatDuration } from "@/components/training/TrainingCard";
import { TrainingPlayer } from "@/components/training/TrainingPlayer";
import { TrainingRating } from "@/components/training/TrainingRating";
import { trainingService } from "@/services/trainingService";

export const dynamic = "force-dynamic";

export default async function TrainingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await trainingService.getVideoById(decodeURIComponent(id));
  if (!video) notFound();
  const related = (await trainingService.getVideos({ groupId: video.groupId })).filter((item) => item.id !== video.id).slice(0, 3);
  return (
    <main className="mx-auto max-w-7xl px-5 py-16 md:py-24">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">{video.groupName}</p>
      <h1 className="mt-5 max-w-4xl text-3xl font-black md:text-5xl">{video.title}</h1>
      <div className="mt-8"><TrainingPlayer videoId={video.id} title={video.title} poster={video.coverPath ? `/api/training/videos/${video.id}/cover` : undefined} initialPlayCount={video.playCount} /></div>
      <section className="mt-10 grid gap-10 border-b border-foreground/[0.1] pb-14 lg:grid-cols-[1fr_320px]">
        <div><p className="text-base leading-8 text-muted-foreground">{video.description || "暂无视频简介。"}</p><div className="mt-6 flex flex-wrap gap-2">{video.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div></div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 text-sm"><div><dt className="text-muted-foreground">讲师</dt><dd className="mt-1 font-bold">{video.speaker || "未填写"}</dd></div><div><dt className="text-muted-foreground">视频时长</dt><dd className="mt-1 font-bold">{formatDuration(video.duration)}</dd></div><div><dt className="text-muted-foreground">推荐指数</dt><dd className="mt-1"><TrainingRating rating={video.rating} showLabel /></dd></div><div><dt className="text-muted-foreground">上传人</dt><dd className="mt-1 font-bold">{video.uploadedBy}</dd></div><div><dt className="text-muted-foreground">更新时间</dt><dd className="mt-1 font-bold">{video.updatedAt.slice(0, 10)}</dd></div></dl>
      </section>
      {related.length ? <section className="py-16"><h2 className="text-2xl font-black">相关推荐</h2><div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">{related.map((item) => <TrainingCard key={item.id} video={item} />)}</div></section> : null}
    </main>
  );
}
