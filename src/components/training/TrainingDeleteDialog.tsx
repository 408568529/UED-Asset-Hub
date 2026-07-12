"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertDialog } from "@/components/ui/dialog";
import { Radio } from "@/components/ui/radio";

export function TrainingDeleteDialog({ title, sourceMode, onCancel, onConfirm }: { title: string; sourceMode: "upload" | "server-local"; onCancel: () => void; onConfirm: (deleteFile: boolean) => void }) {
  const [deleteFile, setDeleteFile] = useState(false);
  return (
    <AlertDialog label="确认删除培训资料" className="max-w-lg">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Delete Training</p>
        <h2 className="mt-4 text-2xl font-black">确认删除“{title}”？</h2>
        <div className="mt-6 space-y-3">
          <label className="flex cursor-pointer gap-3 border border-foreground/[0.1] bg-white p-4"><Radio checked={!deleteFile} onChange={() => setDeleteFile(false)} /><span><strong className="block text-sm">仅删除平台记录</strong><span className="mt-1 block text-xs text-muted-foreground">保留服务器上的视频文件。</span></span></label>
          <label className="flex cursor-pointer gap-3 border border-destructive/25 bg-destructive/[0.04] p-4"><Radio checked={deleteFile} onChange={() => setDeleteFile(true)} /><span><strong className="block text-sm text-destructive">同时删除视频文件</strong><span className="mt-1 block text-xs text-destructive">{sourceMode === "server-local" ? "将删除媒体目录中的原文件，无法恢复。" : "将删除平台存储目录中的视频和封面，无法恢复。"}</span></span></label>
        </div>
        <div className="mt-8 flex justify-end gap-3"><Button type="button" variant="outline" onClick={onCancel}>取消</Button><Button type="button" variant="destructive" onClick={() => onConfirm(deleteFile)}>确认删除</Button></div>
    </AlertDialog>
  );
}
