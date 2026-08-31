import { readJsonFileReadonly } from "@/lib/storage/jsonStorage";
import { operationalStateService } from "@/services/operationalStateService";
import type { TrainingVideo } from "@/types/training";

const VIDEOS_FILE = "training-videos.json";

export const trainingAnalyticsService = {
  async reportWatchProgress(input: { videoId: string; sessionId: string; currentTime: number; watchedSeconds: number }) {
    const video = (await readJsonFileReadonly<TrainingVideo[]>(VIDEOS_FILE, [])).find((item) => item.id === input.videoId);
    if (!video) return null;
    const delta = await operationalStateService.reportTrainingWatch(input);
    const playCount = Number(video.playCount ?? 0) + delta.playCount;
    const totalWatchDuration = Number(video.totalWatchDuration ?? 0) + delta.totalWatchDuration;
    return { playCount, totalWatchDuration, averageWatchDuration: playCount ? totalWatchDuration / playCount : 0, countedPlay: delta.countedPlay };
  },

  async getVideoMetrics(videoId: string) {
    const video = (await readJsonFileReadonly<TrainingVideo[]>(VIDEOS_FILE, [])).find((item) => item.id === videoId);
    if (!video) return null;
    const delta = await operationalStateService.trainingMetric(videoId);
    const playCount = Number(video.playCount ?? 0) + delta.playCount;
    const totalWatchDuration = Number(video.totalWatchDuration ?? 0) + delta.totalWatchDuration;
    return { playCount, totalWatchDuration, averageWatchDuration: playCount ? totalWatchDuration / playCount : 0 };
  }
};
