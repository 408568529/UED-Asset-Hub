import { readOperationalJson, writeOperationalJson } from "@/lib/storage/operationalStorage";
import type { TrainingUploadTask, TrainingWatchSession } from "@/types/training";

type Counter = { views?: number; copies?: number; downloads?: number };
type TrainingMetric = { playCount: number; totalWatchDuration: number };
type Metrics = {
  prompts: Record<string, Counter>;
  skills: Record<string, Counter>;
  skillVersions: Record<string, Counter>;
  fonts: Record<string, Counter>;
  fontVersions: Record<string, Counter>;
  training: Record<string, TrainingMetric>;
  sessions: Record<string, TrainingWatchSession>;
};

const emptyMetrics = (): Metrics => ({ prompts: {}, skills: {}, skillVersions: {}, fonts: {}, fontVersions: {}, training: {}, sessions: {} });
const metricsFile = "metrics.json";
const tasksFile = "training-upload-tasks.json";

async function readMetrics() {
  return readOperationalJson<Metrics>("metrics", metricsFile, emptyMetrics());
}

async function updateMetrics<T>(action: (metrics: Metrics) => T) {
  const metrics = await readMetrics();
  const result = action(metrics);
  await writeOperationalJson("metrics", metricsFile, metrics);
  return result;
}

function counterValue(value: Counter | undefined, field: keyof Counter) {
  return Number(value?.[field] ?? 0);
}

export const operationalStateService = {
  async promptCounters(id: string) {
    return (await readMetrics()).prompts[id] ?? {};
  },

  async recordPrompt(id: string, field: "views" | "copies") {
    return updateMetrics((metrics) => {
      const current = metrics.prompts[id] ?? {};
      const next = { ...current, [field]: counterValue(current, field) + 1 };
      metrics.prompts[id] = next;
      return next;
    });
  },

  async downloadCounters(kind: "skills" | "skillVersions" | "fonts" | "fontVersions", id: string) {
    return (await readMetrics())[kind][id] ?? {};
  },

  async recordDownload(kind: "skills" | "skillVersions" | "fonts" | "fontVersions", id: string) {
    return updateMetrics((metrics) => {
      const current = metrics[kind][id] ?? {};
      const next = { ...current, downloads: counterValue(current, "downloads") + 1 };
      metrics[kind][id] = next;
      return next;
    });
  },

  async trainingMetric(videoId: string) {
    return (await readMetrics()).training[videoId] ?? { playCount: 0, totalWatchDuration: 0 };
  },

  async reportTrainingWatch(input: { videoId: string; sessionId: string; currentTime: number; watchedSeconds: number }) {
    return updateMetrics((metrics) => {
      const sessionKey = `${input.videoId}:${input.sessionId}`;
      const previous = metrics.sessions[sessionKey];
      const now = new Date().toISOString();
      const positionDelta = previous ? input.currentTime - previous.lastCurrentTime : input.currentTime;
      const acceptedSeconds = Math.max(0, Math.min(15, input.watchedSeconds, positionDelta));
      const watchedSeconds = (previous?.watchedSeconds ?? 0) + acceptedSeconds;
      const previouslyCounted = previous?.playCounted ?? false;
      const playCounted = previouslyCounted || watchedSeconds >= 5;
      metrics.sessions[sessionKey] = {
        sessionId: input.sessionId,
        videoId: input.videoId,
        lastCurrentTime: Math.max(input.currentTime, previous?.lastCurrentTime ?? 0),
        watchedSeconds,
        playCounted,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now
      };
      const current = metrics.training[input.videoId] ?? { playCount: 0, totalWatchDuration: 0 };
      const countedPlay = playCounted && !previouslyCounted;
      const next = { playCount: current.playCount + (countedPlay ? 1 : 0), totalWatchDuration: current.totalWatchDuration + acceptedSeconds };
      metrics.training[input.videoId] = next;
      return { ...next, countedPlay };
    });
  },

  async getTrainingTask(id: string) {
    return (await readOperationalJson<TrainingUploadTask[]>("tasks", tasksFile, [])).find((task) => task.id === id) ?? null;
  },

  async upsertTrainingTask(task: TrainingUploadTask) {
    const tasks = await readOperationalJson<TrainingUploadTask[]>("tasks", tasksFile, []);
    const index = tasks.findIndex((item) => item.id === task.id);
    if (index >= 0) tasks[index] = task;
    else tasks.unshift(task);
    await writeOperationalJson("tasks", tasksFile, tasks.slice(0, 200));
  }
};
