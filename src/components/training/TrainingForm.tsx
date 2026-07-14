"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FormToast } from "@/components/admin/FormToast";
import { LabeledField } from "@/components/admin/LabeledField";
import { TagMultiSelectField } from "@/components/admin/TagMultiSelectField";
import { TrainingFolderField } from "@/components/training/TrainingFolderField";
import { TrainingRatingField } from "@/components/training/TrainingRatingField";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Radio } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createClientId } from "@/lib/clientId";
import type { TrainingFolder, TrainingServerFile, TrainingSourceMode, TrainingVideo, TrainingVideoInput } from "@/types/training";

type UploadProgress = { status: string; percent: number; speed: number; eta: number; error?: string };

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatEta(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--";
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} 分 ${Math.ceil(seconds % 60)} 秒` : `${Math.ceil(seconds)} 秒`;
}

export function TrainingForm({ video, initialFolderName = "" }: { video?: TrainingVideo; initialFolderName?: string }) {
  const router = useRouter();
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [input, setInput] = useState<TrainingVideoInput>({ title: video?.title ?? "", description: video?.description ?? "", groupName: video?.groupName ?? initialFolderName, speaker: video?.speaker ?? "", eventDate: video?.eventDate ?? "", tags: video?.tags ?? [], duration: video?.duration ?? 0, rating: video ? video.rating : 3 });
  const [sourceMode, setSourceMode] = useState<TrainingSourceMode>(video?.sourceMode ?? "upload");
  const [replaceVideo, setReplaceVideo] = useState(false);
  const [deleteOriginalFile, setDeleteOriginalFile] = useState(video?.sourceMode === "upload");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [serverFile, setServerFile] = useState("");
  const [folders, setFolders] = useState<TrainingFolder[]>([]);
  const [serverFiles, setServerFiles] = useState<TrainingServerFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<UploadProgress>({ status: "等待上传", percent: 0, speed: 0, eta: 0 });
  const [toast, setToast] = useState<{ message: string; tone?: "success" | "error" | "warning" } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/training/groups").then((response) => response.json()),
      fetch("/api/training/server-files").then((response) => response.ok ? response.json() : [])
    ]).then(([folderItems, fileItems]) => { setFolders(folderItems); setServerFiles(fileItems); }).catch(() => undefined);
  }, []);

  function update<K extends keyof TrainingVideoInput>(key: K, value: TrainingVideoInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  function readDuration(file: File) {
    const url = URL.createObjectURL(file);
    const element = document.createElement("video");
    element.preload = "metadata";
    element.onloadedmetadata = () => { update("duration", Number.isFinite(element.duration) ? element.duration : 0); URL.revokeObjectURL(url); };
    element.onerror = () => URL.revokeObjectURL(url);
    element.src = url;
  }

  async function uploadCover(videoId: string) {
    if (!coverFile) return;
    const formData = new FormData();
    formData.set("cover", coverFile);
    const response = await fetch(`/api/training/videos/${videoId}/cover`, { method: "POST", body: formData });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(result.message ?? "视频已保存，但封面上传失败。");
    }
  }

  function uploadVideo(file: File, replaceId?: string) {
    return new Promise<{ data: TrainingVideo; warning?: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      const taskId = createClientId("training-");
      let lastLoaded = 0;
      let lastTime = Date.now();
      xhr.open("POST", "/api/training/uploads");
      xhr.setRequestHeader("x-upload-task-id", taskId);
      xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
      xhr.setRequestHeader("x-training-metadata", encodeURIComponent(JSON.stringify(input)));
      if (replaceId) {
        xhr.setRequestHeader("x-training-video-id", replaceId);
        xhr.setRequestHeader("x-delete-original-file", String(deleteOriginalFile));
      }
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const now = Date.now();
        const elapsed = Math.max(0.001, (now - lastTime) / 1000);
        const speed = (event.loaded - lastLoaded) / elapsed;
        const eta = speed > 0 ? (event.total - event.loaded) / speed : 0;
        setProgress({ status: "正在上传", percent: Math.round(event.loaded / event.total * 100), speed, eta });
        lastLoaded = event.loaded;
        lastTime = now;
      };
      xhr.upload.onload = () => setProgress((current) => ({ ...current, status: "正在校验", percent: 100 }));
      xhr.onload = () => {
        xhrRef.current = null;
        const result = JSON.parse(xhr.responseText || "{}") as { data?: TrainingVideo; warning?: string; message?: string };
        if (xhr.status >= 200 && xhr.status < 300 && result.data) {
          setProgress((current) => ({ ...current, status: "处理中", percent: 100 }));
          resolve({ data: result.data, warning: result.warning });
        } else reject(new Error(result.message ?? `上传失败（HTTP ${xhr.status}）`));
      };
      xhr.onerror = () => { xhrRef.current = null; reject(new Error("上传连接中断，请检查网络或主机限制。")); };
      xhr.onabort = () => { xhrRef.current = null; reject(new Error("上传已取消。")); };
      xhr.send(file);
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if ((!video || replaceVideo) && sourceMode === "upload" && !videoFile) { setToast({ message: "请选择视频文件。", tone: "error" }); return; }
    if ((!video || replaceVideo) && sourceMode === "server-local" && !serverFile) { setToast({ message: "请选择服务器媒体目录中的视频。", tone: "error" }); return; }
    setSubmitting(true);
    setProgress({ status: sourceMode === "upload" ? "等待上传" : "处理中", percent: 0, speed: 0, eta: 0 });
    try {
      let result: { data: TrainingVideo; warning?: string };
      if (video && replaceVideo && sourceMode === "upload" && videoFile) {
        result = await uploadVideo(videoFile, video.id);
      } else if (video && replaceVideo && sourceMode === "server-local") {
        const response = await fetch("/api/training/import-local", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input, relativePath: serverFile, videoId: video.id, deleteOriginalFile }) });
        const body = await response.json() as { data?: TrainingVideo; warning?: string; message?: string };
        if (!response.ok || !body.data) throw new Error(body.message ?? "服务器视频替换失败。");
        result = { data: body.data, warning: body.warning };
      } else if (video) {
        const response = await fetch(`/api/training/videos/${video.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
        const body = await response.json() as { data?: TrainingVideo; warning?: string; message?: string };
        if (!response.ok || !body.data) throw new Error(body.message ?? "培训资料保存失败。");
        result = { data: body.data, warning: body.warning };
      } else if (sourceMode === "upload" && videoFile) {
        result = await uploadVideo(videoFile);
      } else {
        const response = await fetch("/api/training/import-local", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input, relativePath: serverFile }) });
        const body = await response.json() as { data?: TrainingVideo; warning?: string; message?: string };
        if (!response.ok || !body.data) throw new Error(body.message ?? "服务器文件关联失败。");
        result = { data: body.data, warning: body.warning };
      }
      await uploadCover(result.data.id);
      setProgress({ status: "上传成功", percent: 100, speed: 0, eta: 0 });
      setToast({ message: result.warning ?? (video ? "培训资料保存成功。" : "培训视频上传成功。"), tone: result.warning ? "warning" : "success" });
      window.setTimeout(() => router.push("/admin/training"), 800);
    } catch (error) {
      const message = error instanceof Error ? error.message : "培训资料保存失败。";
      setProgress((current) => ({ ...current, status: message === "上传已取消。" ? "已取消" : "上传失败", error: message }));
      setToast({ message, tone: "error" });
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-10 max-w-3xl space-y-5 border-t border-foreground/10 pt-8">
      {toast ? <FormToast message={toast.message} tone={toast.tone} /> : null}
      <LabeledField label="视频标题"><Input value={input.title} onChange={(event) => update("title", event.target.value)} placeholder="留空时自动使用视频文件名" /></LabeledField>
      <LabeledField label="所属文件夹" required><TrainingFolderField folders={folders} value={input.groupName} onChange={(groupName) => update("groupName", groupName)} onCreated={(folder) => setFolders((current) => [folder, ...current])} /></LabeledField>
      <LabeledField label="视频简介"><Textarea value={input.description ?? ""} onChange={(event) => update("description", event.target.value)} rows={5} /></LabeledField>
      <div className="grid gap-5 md:grid-cols-2"><LabeledField label="讲师"><Input value={input.speaker ?? ""} onChange={(event) => update("speaker", event.target.value)} /></LabeledField><LabeledField label="培训日期"><Input type="date" value={input.eventDate ?? ""} onChange={(event) => update("eventDate", event.target.value)} /></LabeledField></div>
      <LabeledField label="推荐指数"><TrainingRatingField value={input.rating ?? undefined} onChange={(rating) => update("rating", rating ?? null)} /></LabeledField>
      <LabeledField label="标签"><TagMultiSelectField type="training-tag" value={input.tags} onChange={(tags) => update("tags", tags)} /></LabeledField>

      {video ? <LabeledField label="视频文件"><label className="flex items-center gap-3 border border-foreground/10 bg-white p-4 text-sm font-bold"><Checkbox checked={replaceVideo} onChange={(event) => setReplaceVideo(event.target.checked)} />更换当前视频文件<p className="font-normal text-muted-foreground">当前：{video.fileName} · {formatBytes(video.fileSize)}</p></label></LabeledField> : null}
      {(!video || replaceVideo) ? <LabeledField label="上传方式" required><div className="grid gap-3 sm:grid-cols-2"><label className={`cursor-pointer border p-4 ${sourceMode === "upload" ? "border-foreground bg-foreground text-white" : "border-foreground/[0.1] bg-white"}`}><Radio className="mr-2 align-[-2px]" name="sourceMode" value="upload" checked={sourceMode === "upload"} onChange={() => setSourceMode("upload")} />常规上传<p className="mt-2 text-xs opacity-65">从当前电脑上传到服务器。</p></label><label className={`cursor-pointer border p-4 ${sourceMode === "server-local" ? "border-foreground bg-foreground text-white" : "border-foreground/[0.1] bg-white"}`}><Radio className="mr-2 align-[-2px]" name="sourceMode" value="server-local" checked={sourceMode === "server-local"} onChange={() => setSourceMode("server-local")} />关联本地文件<p className="mt-2 text-xs opacity-65">选择服务器媒体目录中的已有视频。</p></label></div></LabeledField> : null}

      {(!video || replaceVideo) && sourceMode === "upload" ? <LabeledField label="视频文件" required><Input type="file" required accept="video/mp4,video/webm,video/quicktime,video/ogg,.m4v" onChange={(event) => { const file = event.target.files?.[0] ?? null; setVideoFile(file); if (file) readDuration(file); }} />{videoFile ? <p className="text-xs text-muted-foreground">{videoFile.name} · {formatBytes(videoFile.size)}</p> : null}</LabeledField> : null}
      {(!video || replaceVideo) && sourceMode === "server-local" ? <LabeledField label="服务器本地视频" required><Select required value={serverFile} onChange={(event) => setServerFile(event.target.value)}><option value="">请选择 TRAINING_MEDIA_DIR 中的文件</option>{serverFiles.map((file) => <option key={file.relativePath} value={file.relativePath}>{file.relativePath} · {formatBytes(file.fileSize)}</option>)}</Select>{!serverFiles.length ? <p className="text-xs text-muted-foreground">媒体目录暂无可关联视频，请先将文件复制到主机配置目录。</p> : null}</LabeledField> : null}
      {video && replaceVideo ? <label className="flex items-center gap-2 text-sm"><Checkbox checked={deleteOriginalFile} onChange={(event) => setDeleteOriginalFile(event.target.checked)} />替换成功后删除原视频文件{video.sourceMode === "server-local" ? "（会删除 training-media 中的原文件）" : ""}</label> : null}
      <LabeledField label="视频封面（可选）"><Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} /></LabeledField>

      {(!video || replaceVideo) && (submitting || progress.error) ? <div className="border border-foreground/[0.1] bg-white p-5"><div className="flex items-center justify-between text-sm font-bold"><span>{progress.status}</span><span>{progress.percent}%</span></div><div className="mt-3 h-2 bg-foreground/[0.08]"><div className="h-full bg-primary transition-[width]" style={{ width: `${progress.percent}%` }} /></div>{progress.status === "正在上传" ? <div className="mt-3 flex flex-wrap gap-5 font-mono text-xs text-muted-foreground"><span>速度 {formatBytes(progress.speed)}/s</span><span>预计剩余 {formatEta(progress.eta)}</span></div> : null}{progress.error ? <p className="mt-3 text-sm text-red-600">失败原因：{progress.error}</p> : null}</div> : null}

      <div className="flex flex-wrap gap-3"><Button type="submit" disabled={submitting}>{submitting ? progress.status : video ? replaceVideo ? "替换培训视频" : "保存培训资料" : progress.error ? "重新上传" : "上传培训视频"}</Button>{submitting && sourceMode === "upload" ? <Button type="button" variant="outline" onClick={() => xhrRef.current?.abort()}>取消上传</Button> : null}<Button type="button" variant="outline" disabled={submitting} onClick={() => router.push("/admin/training")}>返回</Button></div>
    </form>
  );
}
