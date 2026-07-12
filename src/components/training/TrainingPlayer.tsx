"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function TrainingPlayer({ videoId, title, poster, initialPlayCount }: { videoId: string; title: string; poster?: string; initialPlayCount: number }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionId = useRef(typeof crypto !== "undefined" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  const lastReportedTime = useRef(0);
  const [playCount, setPlayCount] = useState(initialPlayCount);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.paused || video.ended || document.visibilityState !== "visible" || video.readyState < 2) return;
      const watchedSeconds = video.currentTime - lastReportedTime.current;
      if (watchedSeconds <= 0 || watchedSeconds > 15) {
        lastReportedTime.current = video.currentTime;
        return;
      }
      lastReportedTime.current = video.currentTime;
      fetch(`/api/training/videos/${videoId}/watch-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId.current, currentTime: video.currentTime, watchedSeconds })
      }).then(async (response) => {
        if (!response.ok) return;
        const metrics = await response.json() as { playCount?: number; countedPlay?: boolean };
        if (Number.isFinite(metrics.playCount)) setPlayCount(Number(metrics.playCount));
        if (metrics.countedPlay) router.refresh();
      }).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [router, videoId]);

  return (
    <div>
      <video
      ref={videoRef}
      controls
      preload="metadata"
      poster={poster}
      className="aspect-video w-full bg-black"
      onPlay={(event) => { lastReportedTime.current = event.currentTarget.currentTime; }}
      aria-label={`播放 ${title}`}
    >
      <source src={`/api/training/videos/${videoId}/stream`} />
      当前浏览器不支持视频播放。
      </video>
      <p className="mt-3 text-right font-mono text-xs text-muted-foreground">{playCount} 次播放</p>
    </div>
  );
}
