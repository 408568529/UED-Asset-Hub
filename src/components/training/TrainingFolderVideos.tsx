"use client";

import { useMemo, useState } from "react";
import { TrainingCard } from "@/components/training/TrainingCard";
import { Input } from "@/components/ui/input";
import type { TrainingVideo } from "@/types/training";

export function TrainingFolderVideos({ videos }: { videos: TrainingVideo[] }) {
  const [keyword, setKeyword] = useState("");
  const filtered = useMemo(() => {
    const query = keyword.trim().toLocaleLowerCase();
    return videos.filter((video) => !query || [video.title, video.description, video.speaker, ...video.tags].filter(Boolean).join(" ").toLocaleLowerCase().includes(query));
  }, [keyword, videos]);
  return (
    <section className="mt-10">
      <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索当前文件夹内的视频" className="md:max-w-md" />
      <div className="mt-10 grid gap-x-6 gap-y-12 md:grid-cols-2 lg:grid-cols-3">{filtered.map((video) => <TrainingCard key={video.id} video={video} />)}</div>
      {!filtered.length ? <p className="py-16 text-center text-muted-foreground">当前文件夹暂无符合条件的视频。</p> : null}
    </section>
  );
}
