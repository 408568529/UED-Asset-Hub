import { promises as fs } from "node:fs";
import { readJsonFile, writeJsonFile } from "@/lib/storage/jsonStorage";
import { normalizeTrainingName } from "@/lib/trainingUtils";
import { getLinkedServerFile, removeLinkedServerFile, removeTrainingVideoFiles, resolveTrainingCoverPath, resolveTrainingVideoPath } from "@/lib/trainingStorage";
import { operationLogService } from "@/services/operationLogService";
import { uploadRecordService } from "@/services/uploadRecordService";
import type { DeleteResult, MutationResult } from "@/types/serviceResult";
import type { TrainingFolder, TrainingGroup, TrainingSourceMode, TrainingTopic, TrainingUploadTask, TrainingVideo, TrainingVideoInput } from "@/types/training";

const GROUPS_FILE = "training-groups.json";
const TOPICS_FILE = "training-topics.json";
const VIDEOS_FILE = "training-videos.json";
const TASKS_FILE = "training-upload-tasks.json";

function createId(prefix: string, name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "") || prefix;
  return `${prefix}-${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeRating(value: unknown) {
  const rating = Number(value);
  return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : undefined;
}

function normalizeVideo(video: Omit<Partial<TrainingVideo>, "rating"> & { rating?: number | null }): TrainingVideo {
  const now = new Date().toISOString();
  const playCount = Number(video.playCount ?? 0);
  const totalWatchDuration = Number(video.totalWatchDuration ?? 0);
  const groupName = video.groupName?.trim() || "未分类资料";
  const legacyTopic = video.topicName?.trim();
  const tags = [...(Array.isArray(video.tags) ? video.tags : []), ...(legacyTopic && legacyTopic !== "未分类" ? [legacyTopic] : [])];
  const uniqueTags = [...new Map(tags.map((tag) => [tag.trim().toLocaleLowerCase(), tag.trim()])).values()].filter(Boolean);
  return {
    id: video.id ?? createId("training", video.title ?? "video"),
    title: video.title ?? "未命名培训视频",
    description: video.description ?? "",
    groupId: video.groupId ?? (groupName === "未分类资料" ? "ungrouped" : `legacy-${normalizeTrainingName(groupName)}`),
    groupName,
    topicId: video.topicId,
    topicName: video.topicName,
    speaker: video.speaker ?? "",
    eventDate: video.eventDate ?? "",
    tags: uniqueTags,
    coverPath: video.coverPath ?? "",
    videoPath: video.videoPath ?? "",
    sourceMode: video.sourceMode === "server-local" ? "server-local" : "upload",
    fileName: video.fileName ?? "training-video",
    fileSize: Number(video.fileSize ?? 0),
    duration: Number(video.duration ?? 0),
    rating: normalizeRating(video.rating),
    totalWatchDuration,
    averageWatchDuration: playCount ? totalWatchDuration / playCount : 0,
    playCount,
    uploadedBy: video.uploadedBy ?? "unknown",
    createdAt: video.createdAt ?? now,
    updatedAt: video.updatedAt ?? video.createdAt ?? now
  };
}

async function captureWarning(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    console.error(error);
    return "培训资料操作已完成，但日志或上传记录写入失败。";
  }
  return undefined;
}

async function ensureGroup(groupName: string) {
  const groups = await readJsonFile<TrainingGroup[]>(GROUPS_FILE, []);
  const normalizedGroupName = normalizeTrainingName(groupName);
  let group = groups.find((item) => item.normalizedName === normalizedGroupName);
  if (!group) {
    const now = new Date().toISOString();
    group = { id: createId("group", groupName), name: groupName.trim().replace(/\s+/g, " "), normalizedName: normalizedGroupName, createdAt: now, updatedAt: now };
    await writeJsonFile(GROUPS_FILE, [group, ...groups]);
  }
  return group;
}

function matchesVideo(video: TrainingVideo, keyword?: string) {
  const normalized = keyword?.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [video.title, video.description, video.groupName, video.speaker, ...(video.tags ?? [])].filter(Boolean).join(" ").toLocaleLowerCase().includes(normalized);
}

export const trainingService = {
  async getGroups() {
    return (await readJsonFile<TrainingGroup[]>(GROUPS_FILE, [])).sort((a, b) => a.name.localeCompare(b.name));
  },

  async getFolders(keyword?: string): Promise<TrainingFolder[]> {
    const [groups, videos] = await Promise.all([this.getGroups(), this.getVideos()]);
    const byId = new Map(groups.map((group) => [group.id, group]));
    videos.forEach((video) => {
      if (!byId.has(video.groupId)) {
        byId.set(video.groupId, {
          id: video.groupId,
          name: video.groupName,
          normalizedName: normalizeTrainingName(video.groupName),
          createdAt: video.createdAt,
          updatedAt: video.updatedAt
        });
      }
    });
    const normalizedKeyword = keyword?.trim().toLocaleLowerCase();
    return [...byId.values()].map((group) => {
      const folderVideos = videos.filter((video) => video.groupId === group.id || normalizeTrainingName(video.groupName) === group.normalizedName);
      const latestVideo = folderVideos[0];
      return {
        ...group,
        videoCount: folderVideos.length,
        updatedAt: latestVideo?.updatedAt ?? group.updatedAt ?? group.createdAt,
        coverVideoId: folderVideos.find((video) => video.coverPath)?.id
      };
    }).filter((folder) => !normalizedKeyword || [folder.name, ...videos.filter((video) => video.groupId === folder.id).flatMap((video) => [video.title, video.speaker, ...video.tags])].filter(Boolean).join(" ").toLocaleLowerCase().includes(normalizedKeyword))
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  },

  async getFolderById(id: string) {
    return (await this.getFolders()).find((folder) => folder.id === id) ?? null;
  },

  async getTopics(groupId?: string) {
    return (await readJsonFile<TrainingTopic[]>(TOPICS_FILE, [])).filter((topic) => !groupId || topic.groupId === groupId).sort((a, b) => a.name.localeCompare(b.name));
  },

  async createGroup(name: string) {
    const groups = await readJsonFile<TrainingGroup[]>(GROUPS_FILE, []);
    const normalizedName = normalizeTrainingName(name);
    const existing = groups.find((group) => group.normalizedName === normalizedName);
    if (existing) return existing;
    const now = new Date().toISOString();
    const group = { id: createId("group", name), name: name.trim().replace(/\s+/g, " "), normalizedName, createdAt: now, updatedAt: now };
    await writeJsonFile(GROUPS_FILE, [group, ...groups]);
    return group;
  },

  async createTopic(groupId: string, name: string) {
    const groups = await readJsonFile<TrainingGroup[]>(GROUPS_FILE, []);
    if (!groups.some((group) => group.id === groupId)) throw new Error("培训分组不存在。");
    const topics = await readJsonFile<TrainingTopic[]>(TOPICS_FILE, []);
    const normalizedName = normalizeTrainingName(name);
    const existing = topics.find((topic) => topic.groupId === groupId && topic.normalizedName === normalizedName);
    if (existing) return existing;
    const topic = { id: createId("topic", name), groupId, name: name.trim().replace(/\s+/g, " "), normalizedName, createdAt: new Date().toISOString() };
    await writeJsonFile(TOPICS_FILE, [topic, ...topics]);
    return topic;
  },

  async getVideos(filters?: { keyword?: string; groupId?: string }) {
    const videos = (await readJsonFile<Partial<TrainingVideo>[]>(VIDEOS_FILE, [])).map(normalizeVideo);
    return videos
      .filter((video) => matchesVideo(video, filters?.keyword))
      .filter((video) => !filters?.groupId || video.groupId === filters.groupId)
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  },

  async countVideos() {
    return (await this.getVideos()).length;
  },

  async getVideoById(id: string) {
    return (await this.getVideos()).find((video) => video.id === id) ?? null;
  },

  async createVideo(input: TrainingVideoInput, file: { videoPath: string; fileName: string; fileSize: number; sourceMode: "upload" | "server-local" }, operator = "admin"): Promise<MutationResult<TrainingVideo>> {
    const videos = await this.getVideos();
    const group = await ensureGroup(input.groupName);
    const now = new Date().toISOString();
    const video: TrainingVideo = normalizeVideo({
      id: createId("training", input.title),
      ...input,
      groupId: group.id,
      groupName: group.name,
      topicId: undefined,
      topicName: undefined,
      videoPath: file.videoPath,
      fileName: file.fileName,
      fileSize: file.fileSize,
      sourceMode: file.sourceMode,
      uploadedBy: operator,
      createdAt: now,
      updatedAt: now
    });
    await writeJsonFile(VIDEOS_FILE, [video, ...videos]);
    const warning = await captureWarning(async () => {
      await operationLogService.createLog({
        type: "upload",
        title: `${file.sourceMode === "upload" ? "上传" : "关联"}培训视频：${video.title}`,
        description: video.groupName,
        targetType: "training",
        targetId: video.id,
        targetName: video.title,
        operator,
        diffSummary: [`文件名：${video.fileName}`, `文件大小：${video.fileSize} bytes`, `方式：${file.sourceMode}`]
      });
      await uploadRecordService.createUpload({
        fileName: video.fileName,
        fileType: "other",
        fileSize: video.fileSize,
        assetModule: "training",
        relatedAssetId: video.id,
        relatedAssetName: video.title,
        operator,
        status: "success",
        uploadMode: file.sourceMode,
        summary: file.sourceMode === "upload" ? "培训视频上传成功" : "已关联服务器媒体目录文件",
        storagePath: video.videoPath
      });
    });
    return { data: video, warning };
  },

  async importServerFile(input: TrainingVideoInput, relativePath: string, operator = "admin", videoId?: string, deleteOriginalFile?: boolean) {
    const file = await getLinkedServerFile(relativePath);
    if (videoId) return this.replaceVideoFile(videoId, input, { videoPath: file.storedPath, fileName: file.fileName, fileSize: file.fileSize, sourceMode: "server-local" }, { operator, deleteOriginalFile });
    return this.createVideo(input, { videoPath: file.storedPath, fileName: file.fileName, fileSize: file.fileSize, sourceMode: "server-local" }, operator);
  },

  async updateVideo(id: string, input: TrainingVideoInput, operator = "admin") {
    const videos = await this.getVideos();
    const index = videos.findIndex((video) => video.id === id);
    if (index < 0) return null;
    const group = await ensureGroup(input.groupName);
    const video = normalizeVideo({ ...videos[index], ...input, groupId: group.id, groupName: group.name, topicId: undefined, topicName: undefined, updatedAt: new Date().toISOString() });
    videos[index] = video;
    await writeJsonFile(VIDEOS_FILE, videos);
    const warning = await captureWarning(() => operationLogService.createLog({
      type: "update",
      title: `编辑培训资料：${video.title}`,
      description: video.groupName,
      targetType: "training",
      targetId: video.id,
      targetName: video.title,
      operator,
      diffSummary: ["培训资料元数据已更新"]
    }).then(() => undefined));
    return { data: video, warning };
  },

  async replaceVideoFile(id: string, input: TrainingVideoInput, file: { videoPath: string; fileName: string; fileSize: number; sourceMode: TrainingSourceMode }, options: { deleteOriginalFile?: boolean; operator?: string } = {}) {
    const videos = await this.getVideos();
    const index = videos.findIndex((video) => video.id === id);
    if (index < 0) return null;
    const previous = videos[index];
    const group = await ensureGroup(input.groupName);
    const video = normalizeVideo({ ...previous, ...input, groupId: group.id, groupName: group.name, videoPath: file.videoPath, fileName: file.fileName, fileSize: file.fileSize, sourceMode: file.sourceMode, topicId: undefined, topicName: undefined, updatedAt: new Date().toISOString() });
    videos[index] = video;
    await writeJsonFile(VIDEOS_FILE, videos);
    const warning = await captureWarning(async () => {
      if (options.deleteOriginalFile) {
        if (previous.sourceMode === "server-local") await removeLinkedServerFile(previous.videoPath);
        else await fs.rm(resolveTrainingVideoPath(previous.videoPath), { force: true });
      }
      await operationLogService.createLog({
        type: "update",
        title: `替换培训视频：${video.title}`,
        description: `${previous.fileName} → ${video.fileName}`,
        targetType: "training",
        targetId: video.id,
        targetName: video.title,
        operator: options.operator ?? "admin",
        diffSummary: [`新文件：${video.fileName}`, `方式：${video.sourceMode}`, options.deleteOriginalFile ? "已删除原视频文件" : "保留原视频文件"]
      });
      await uploadRecordService.createUpload({
        fileName: video.fileName,
        fileType: "other",
        fileSize: video.fileSize,
        assetModule: "training",
        relatedAssetId: video.id,
        relatedAssetName: video.title,
        operator: options.operator ?? "admin",
        status: "success",
        uploadMode: video.sourceMode,
        summary: "培训视频已替换",
        storagePath: video.videoPath
      });
    });
    return { data: video, warning };
  },

  async updateCover(id: string, coverPath: string, operator = "admin") {
    const videos = await this.getVideos();
    const index = videos.findIndex((video) => video.id === id);
    if (index < 0) return null;
    videos[index] = { ...videos[index], coverPath, updatedAt: new Date().toISOString() };
    await writeJsonFile(VIDEOS_FILE, videos);
    await captureWarning(() => operationLogService.createLog({
      type: "update",
      title: `更新培训封面：${videos[index].title}`,
      description: "上传或替换培训视频封面",
      targetType: "training",
      targetId: id,
      targetName: videos[index].title,
      operator
    }).then(() => undefined));
    return videos[index];
  },

  async deleteVideo(id: string, options: { deleteFile?: boolean; operator?: string } = {}): Promise<DeleteResult> {
    const videos = await this.getVideos();
    const video = videos.find((item) => item.id === id);
    if (!video) return { deleted: false };
    await writeJsonFile(VIDEOS_FILE, videos.filter((item) => item.id !== id));
    const warning = await captureWarning(async () => {
      if (options.deleteFile) {
        if (video.sourceMode === "server-local") {
          await removeLinkedServerFile(video.videoPath);
          if (video.coverPath) await fs.rm(resolveTrainingCoverPath(video.coverPath), { force: true });
        }
        else await removeTrainingVideoFiles(video.videoPath, video.coverPath);
      } else if (video.coverPath) {
        await fs.rm(resolveTrainingCoverPath(video.coverPath), { force: true });
      }
      await operationLogService.createLog({
        type: "delete",
        title: `删除培训资料：${video.title}`,
        description: options.deleteFile ? "删除元数据及服务器视频文件" : "仅删除平台记录，保留服务器视频文件",
        targetType: "training",
        targetId: id,
        targetName: video.title,
        operator: options.operator ?? "admin",
        diffSummary: [options.deleteFile ? "同时删除视频文件" : "保留视频文件"]
      });
    });
    return { deleted: true, warning };
  },

  async getVideoFile(id: string) {
    const video = await this.getVideoById(id);
    if (!video) return null;
    return { video, absolutePath: resolveTrainingVideoPath(video.videoPath) };
  },

  async getCoverFile(id: string) {
    const video = await this.getVideoById(id);
    if (!video?.coverPath) return null;
    return { video, absolutePath: resolveTrainingCoverPath(video.coverPath) };
  },

  async getUploadTask(id: string) {
    return (await readJsonFile<TrainingUploadTask[]>(TASKS_FILE, [])).find((task) => task.id === id) ?? null;
  },

  async upsertUploadTask(task: TrainingUploadTask) {
    const tasks = await readJsonFile<TrainingUploadTask[]>(TASKS_FILE, []);
    const index = tasks.findIndex((item) => item.id === task.id);
    if (index >= 0) tasks[index] = task;
    else tasks.unshift(task);
    await writeJsonFile(TASKS_FILE, tasks.slice(0, 200));
    return task;
  }
};
