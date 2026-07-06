"use client";

import { useMemo, useState } from "react";
import type { FontAsset } from "@/types/font";

export function FontPreview({ font }: { font: FontAsset }) {
  const [sample, setSample] = useState("The quick brown fox\n海鼎设计团队");
  const fontFamily = useMemo(() => `ued-font-${font.id}`, [font.id]);
  const canPreview = ["otf", "ttf", "woff", "woff2"].includes(font.fileFormat);

  return (
    <section className="bg-white p-6 md:p-8">
      {canPreview ? (
        <style>{`@font-face { font-family: "${fontFamily}"; src: url("/api/fonts/${font.id}/download?preview=1") format("${font.fileFormat === "ttf" ? "truetype" : font.fileFormat === "otf" ? "opentype" : font.fileFormat}"); }`}</style>
      ) : null}
      <h2 className="text-2xl font-black">在线预览</h2>
      <textarea
        value={sample}
        onChange={(event) => setSample(event.target.value)}
        className="mt-6 min-h-24 w-full border border-foreground/[0.08] bg-[#f8f7f1] px-4 py-3 text-sm outline-none focus:border-foreground/25"
      />
      <div
        className="mt-6 min-h-48 whitespace-pre-wrap bg-[#f8f7f1] p-6 text-5xl leading-tight"
        style={canPreview ? { fontFamily } : undefined}
      >
        {sample}
      </div>
      {!canPreview ? <p className="mt-3 text-sm text-muted-foreground">ZIP 字体家族暂不支持在线预览，请下载后安装查看。</p> : null}
    </section>
  );
}
