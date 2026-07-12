"use client";

import { Button } from "@/components/ui/button";
import { AlertDialog } from "@/components/ui/dialog";

export function DeleteConfirmDialog({
  assetName,
  onCancel,
  onConfirm
}: {
  assetName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog label="确认删除资产">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Delete Asset</p>
        <h2 className="mt-4 text-3xl font-black">确认删除该资产？</h2>
        <p className="mt-5 text-sm leading-7 text-muted-foreground">
          资产名称：<span className="font-bold text-foreground">{assetName}</span>
        </p>
        <p className="mt-2 text-sm leading-7 text-destructive">删除后不可恢复。</p>
        <div className="mt-8 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>确认删除</Button>
        </div>
    </AlertDialog>
  );
}
