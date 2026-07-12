"use client";

import Link from "next/link";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { FormToast } from "@/components/admin/FormToast";
import { TrainingDeleteDialog } from "@/components/training/TrainingDeleteDialog";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/components/training/TrainingCard";
import { formatTrainingRating } from "@/components/training/TrainingRating";
import type { TrainingVideo } from "@/types/training";

export function TrainingAdminList({ initialVideos }: { initialVideos: TrainingVideo[] }) {
  const [videos, setVideos] = useState(initialVideos);
  const [deleteTarget, setDeleteTarget] = useState<TrainingVideo | null>(null);
  const [toast, setToast] = useState<{ message: string; tone?: "success" | "error" | "warning" } | null>(null);

  async function confirmDelete(deleteFile: boolean) {
    if (!deleteTarget) return;
    const response = await fetch(`/api/training/videos/${deleteTarget.id}?deleteFile=${deleteFile}`, { method: "DELETE" });
    const result = await response.json() as { warning?: string; message?: string };
    if (response.ok) {
      setVideos((current) => current.filter((video) => video.id !== deleteTarget.id));
      setToast({ message: result.warning ?? "培训资料已删除。", tone: result.warning ? "warning" : "success" });
    } else setToast({ message: result.message ?? "删除失败。", tone: "error" });
    setDeleteTarget(null);
  }

  return (
    <section className="mt-10 border-t border-foreground/[0.1]">
      {toast ? <FormToast message={toast.message} tone={toast.tone} /> : null}
      {videos.map((video) => (
        <article key={video.id} className="grid gap-5 border-b border-foreground/[0.1] py-7 lg:grid-cols-[1fr_160px_200px_auto] lg:items-center">
          <div><p className="font-mono text-xs text-muted-foreground">{video.groupName}</p><h2 className="mt-3 text-xl font-black">{video.title}</h2><p className="mt-2 text-sm text-muted-foreground">{video.fileName} · {video.sourceMode}</p></div>
          <div className="font-mono text-xs text-muted-foreground"><p>{video.playCount} 次播放</p><p className="mt-2">时长 {formatDuration(video.duration)}</p><p className="mt-2">推荐 {formatTrainingRating(video.rating)}</p></div>
          <div className="font-mono text-xs text-muted-foreground"><p>平均观看 {formatDuration(video.averageWatchDuration)}</p><p className="mt-2">总观看 {formatDuration(video.totalWatchDuration)}</p></div>
          <div className="flex gap-2 lg:justify-end"><Button asChild size="sm" variant="outline"><Link href={`/training/${video.id}`}>查看</Link></Button><Button asChild size="icon" variant="outline"><Link href={`/admin/training/${video.id}/edit`} aria-label={`编辑 ${video.title}`}><Pencil size={15} /></Link></Button><Button type="button" size="icon" variant="outline" onClick={() => setDeleteTarget(video)} aria-label={`删除 ${video.title}`}><Trash2 size={15} /></Button></div>
        </article>
      ))}
      {!videos.length ? <p className="border-b border-foreground/[0.1] py-12 text-muted-foreground">暂无培训资料。</p> : null}
      {deleteTarget ? <TrainingDeleteDialog title={deleteTarget.title} sourceMode={deleteTarget.sourceMode} onCancel={() => setDeleteTarget(null)} onConfirm={(deleteFile) => void confirmDelete(deleteFile)} /> : null}
    </section>
  );
}
