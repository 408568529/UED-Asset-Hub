import { notFound } from "next/navigation";
import { AssetDetailHeader } from "@/components/layout/AssetDetailHeader";
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
    <main className="page-shell page-frame">
      <AssetDetailHeader
        eyebrow={video.groupName}
        marker="TR"
        title={video.title}
        description={video.description || "团队培训视频资料"}
        meta={<><p>Speaker · <strong className="text-foreground">{video.speaker || "未填写"}</strong></p><p>Duration · {formatDuration(video.duration)}</p><p>Updated · {video.updatedAt.slice(0, 10)}</p><p>Uploaded by · {video.uploadedBy}</p><TrainingRating rating={video.rating} showLabel /></>}
        tags={<>{video.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</>}
      />
      <div className="detail-surface mt-6 p-3 md:p-4"><TrainingPlayer videoId={video.id} title={video.title} poster={video.coverPath ? `/api/training/videos/${video.id}/cover` : undefined} initialPlayCount={video.playCount} /></div>
      <section className="detail-surface mt-6 p-6 lg:p-8">
        <p className="section-kicker">Video notes</p>
        <h2 className="mt-3 text-xl font-black">视频说明</h2>
        <p className="mt-4 max-w-4xl text-base leading-8 text-muted-foreground">{video.description || "暂无视频简介。"}</p>
      </section>
      {related.length ? <section className="py-16"><h2 className="text-2xl font-black">相关推荐</h2><div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">{related.map((item) => <TrainingCard key={item.id} video={item} />)}</div></section> : null}
    </main>
  );
}
