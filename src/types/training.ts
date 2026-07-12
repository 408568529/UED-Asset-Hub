export type TrainingSourceMode = "upload" | "server-local";
export type TrainingUploadStatus = "waiting" | "uploading" | "validating" | "processing" | "success" | "failed" | "cancelled";

export interface TrainingGroup {
  id: string;
  name: string;
  normalizedName: string;
  description?: string;
  coverPath?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface TrainingFolder extends TrainingGroup {
  videoCount: number;
  updatedAt: string;
  coverVideoId?: string;
}

export interface TrainingTopic {
  id: string;
  groupId: string;
  name: string;
  normalizedName: string;
  createdAt: string;
}

export interface TrainingVideo {
  id: string;
  title: string;
  description?: string;
  groupId: string;
  groupName: string;
  topicId?: string;
  topicName?: string;
  speaker?: string;
  eventDate?: string;
  tags: string[];
  coverPath?: string;
  videoPath: string;
  sourceMode: TrainingSourceMode;
  fileName: string;
  fileSize: number;
  duration: number;
  rating?: number;
  totalWatchDuration: number;
  averageWatchDuration: number;
  playCount: number;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingVideoInput {
  title: string;
  description?: string;
  groupName: string;
  speaker?: string;
  eventDate?: string;
  tags: string[];
  duration?: number;
  rating?: number | null;
}

export interface TrainingUploadTask {
  id: string;
  fileName: string;
  status: TrainingUploadStatus;
  uploadedBytes: number;
  totalBytes: number;
  failureReason?: string;
  videoId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingServerFile {
  relativePath: string;
  fileName: string;
  fileSize: number;
  updatedAt: string;
}

export interface TrainingWatchSession {
  sessionId: string;
  videoId: string;
  lastCurrentTime: number;
  watchedSeconds: number;
  playCounted?: boolean;
  createdAt: string;
  updatedAt: string;
}
