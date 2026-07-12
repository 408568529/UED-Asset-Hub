"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

async function copyText(content: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(content);
      return true;
    } catch {
      // Fall back for intranet HTTP pages where Clipboard API can be blocked.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = content;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

export function PromptCopyButton({ promptId, content, onCopied }: { promptId: string; content: string; onCopied?: () => void }) {
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function copyPrompt() {
    const copied = await copyText(content);
    setIsError(!copied);
    setMessage(copied ? "Prompt 已复制到剪贴板" : "复制失败，请手动复制");
    if (copied) {
      const response = await fetch(`/api/prompts/${promptId}/copy`, { method: "POST" }).catch(() => null);
      if (response?.ok) onCopied?.();
    }
    window.setTimeout(() => setMessage(""), 1800);
  }

  return (
    <div className="flex items-center gap-3">
      <Button type="button" onClick={copyPrompt}>
        复制 Prompt
        <Copy size={16} />
      </Button>
      {message ? <span className={`text-sm font-bold ${isError ? "text-red-600" : "text-muted-foreground"}`} aria-live="polite">{message}</span> : null}
    </div>
  );
}
