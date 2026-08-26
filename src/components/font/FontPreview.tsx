"use client";

import { useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import type { FontAsset } from "@/types/font";

export function FontPreview({ font, variant = "default" }: { font: FontAsset; variant?: "default" | "workspace" }) {
  const [sample, setSample] = useState("The quick brown fox\n海鼎设计团队");
  const fontFamily = useMemo(() => `ued-font-${font.id}`, [font.id]);
  const canPreview = ["otf", "ttf", "woff", "woff2"].includes(font.fileFormat);

  return (
    <section className={variant === "workspace" ? "border-b border-border px-4 py-5 md:px-6" : "detail-surface p-6 md:p-8"}>
      {canPreview ? (
        <style>{`@font-face { font-family: "${fontFamily}"; src: url("/api/fonts/${font.id}/download?preview=1") format("${font.fileFormat === "ttf" ? "truetype" : font.fileFormat === "otf" ? "opentype" : font.fileFormat}"); }`}</style>
      ) : null}
      <h2 className={variant === "workspace" ? "text-sm font-black" : "text-2xl font-black"}>在线预览</h2>
      <Textarea
        value={sample}
        onChange={(event) => setSample(event.target.value)}
        className={variant === "workspace" ? "mt-3 min-h-24 bg-background" : "mt-6 min-h-24 bg-background"}
      />
      <div
        className={variant === "workspace" ? "mt-3 min-h-48 whitespace-pre-wrap bg-[hsl(var(--surface-subtle)/0.55)] p-4 text-4xl leading-tight" : "mt-6 min-h-48 whitespace-pre-wrap bg-[#f8f7f1] p-6 text-5xl leading-tight"}
        style={canPreview ? { fontFamily } : undefined}
      >
        {sample}
      </div>
      {!canPreview ? <p className="mt-3 text-sm text-muted-foreground">ZIP 字体家族暂不支持在线预览，请下载后安装查看。</p> : null}
    </section>
  );
}
