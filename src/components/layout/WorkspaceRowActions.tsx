"use client";
import "./workspace-row-actions.css";
import { Pencil, Trash2 } from "lucide-react";
import type { MouseEventHandler } from "react";

export function WorkspaceRowActions({ name, disabled, onRename, onDelete }: { name: string; disabled?: boolean; onRename: MouseEventHandler<HTMLButtonElement>; onDelete: MouseEventHandler<HTMLButtonElement> }) {
  return <div className="workspace-row-actions flex shrink-0 items-center">
    <button type="button" className="workspace-row-action" disabled={disabled} aria-label={`重命名${name}`} onClick={onRename}><Pencil size={14}/></button>
    <button type="button" className="workspace-row-action" disabled={disabled} aria-label={`删除${name}`} onClick={onDelete}><Trash2 size={14}/></button>
  </div>;
}
