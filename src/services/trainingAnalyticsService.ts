import { readJsonFile, writeJsonFile } from "@/lib/storage/jsonStorage";
import type { TrainingVideo, TrainingWatchSession } from "@/types/training";

const VIDEOS_FILE = "training-videos.json";
const SESSIONS_FILE = "training-watch-sessions.json";

export const trainingAnalyticsService = {
  async reportWatchProgress(input: { videoId: string; sessionId: string; currentTime: number; watchedSeconds: number }) {
    const videos = await readJsonFile<TrainingVideo[]>(VIDEOS_FILE, []);
    const videoIndex = videos.findIndex((video) => video.id === input.videoId);
    if (videoIndex < 0) return null;
    const sessions = await readJsonFile<TrainingWatchSession[]>(SESSIONS_FILE, []);
    const sessionIndex = sessions.findIndex((session) => session.videoId === input.videoId && session.sessionId === input.sessionId);
    const now = new Date().toISOString();
    const previous = sessionIndex >= 0 ? sessions[sessionIndex] : null;
    const positionDelta = previous ? input.currentTime - previous.lastCurrentTime : input.currentTime;
    const acceptedSeconds = Math.max(0, Math.min(15, input.watchedSeconds, positionDelta));
    const watchedSeconds = (previous?.watchedSeconds ?? 0) + acceptedSeconds;
    const previouslyCounted = previous?.playCounted ?? Boolean(previous && previous.watchedSeconds >= 5);
    const playCounted = previouslyCounted || watchedSeconds >= 5;
    const session: TrainingWatchSession = {
      sessionId: input.sessionId,
      videoId: input.videoId,
      lastCurrentTime: Math.max(input.currentTime, previous?.lastCurrentTime ?? 0),
      watchedSeconds,
      playCounted,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now
    };
    if (sessionIndex >= 0) sessions[sessionIndex] = session;
    else sessions.unshift(session);

    const video = videos[videoIndex];
    const countedPlay = playCounted && !previouslyCounted;
    const playCount = Number(video.playCount ?? 0) + (countedPlay ? 1 : 0);
    const totalWatchDuration = Number(video.totalWatchDuration ?? 0) + acceptedSeconds;
    videos[videoIndex] = { ...video, playCount, totalWatchDuration, averageWatchDuration: playCount ? totalWatchDuration / playCount : 0 };
    await Promise.all([writeJsonFile(SESSIONS_FILE, sessions.slice(0, 5000)), writeJsonFile(VIDEOS_FILE, videos)]);
    return { playCount, totalWatchDuration, averageWatchDuration: videos[videoIndex].averageWatchDuration, countedPlay };
  },

  async getVideoMetrics(videoId: string) {
    const video = (await readJsonFile<TrainingVideo[]>(VIDEOS_FILE, [])).find((item) => item.id === videoId);
    return video ? { playCount: video.playCount, totalWatchDuration: video.totalWatchDuration, averageWatchDuration: video.averageWatchDuration } : null;
  }
};
