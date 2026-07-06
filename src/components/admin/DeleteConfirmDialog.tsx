"use client";

import { Button } from "@/components/ui/button";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 px-5 backdrop-blur-sm">
      <div className="w-full max-w-md border border-foreground/10 bg-[#fffefa] p-7 shadow-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Delete Asset</p>
        <h2 className="mt-4 text-3xl font-black">确认删除该资产？</h2>
        <p className="mt-5 text-sm leading-7 text-muted-foreground">
          资产名称：<span className="font-bold text-foreground">{assetName}</span>
        </p>
        <p className="mt-2 text-sm leading-7 text-red-600">删除后不可恢复。</p>
        <div className="mt-8 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
          <button type="button" onClick={onConfirm} className="h-11 min-w-28 bg-red-600 px-5 text-sm font-bold leading-none text-white transition hover:bg-red-700">
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}
