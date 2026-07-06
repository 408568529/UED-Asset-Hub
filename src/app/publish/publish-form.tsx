"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { categories } from "@/data/mock/categories";
import { topics } from "@/data/mock/topics";
import { aiService } from "@/services/aiService";

export function PublishForm() {
  const [content, setContent] = useState("");
  const [summary, setSummary] = useState("");

  async function generateSummary() {
    setSummary(await aiService.generateSummary("draft"));
  }

  function submit(action: "draft" | "publish") {
    console.log(`[TODO] ${action} asset`, { content, summary });
  }

  return (
    <section className="rounded-[2rem] bg-white p-6 shadow-card md:p-8">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium">标题</span>
          <Input placeholder="例如：云资金账户限制集设计说明" />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">封面</span>
          <Input placeholder="封面 URL 或后续上传文件地址" />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">分类</span>
          <select className="h-12 w-full rounded-full border border-foreground/[0.08] bg-white px-4 text-sm outline-none focus:border-foreground/25">
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">专题</span>
          <select className="h-12 w-full rounded-full border border-foreground/[0.08] bg-white px-4 text-sm outline-none focus:border-foreground/25">
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>{topic.title}</option>
            ))}
          </select>
        </label>
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-medium">标签</span>
          <Input placeholder="用逗号分隔，例如：Portal, 信息架构, 复盘" />
        </label>
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-medium">正文编辑区</span>
          <Textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="支持后续替换为 Markdown / 富文本编辑器..." rows={10} />
        </label>
      </div>

      {summary ? <p className="mt-5 rounded-2xl bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">{summary}</p> : null}

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button type="button" variant="outline" onClick={generateSummary}>
          <Sparkles size={16} />
          AI生成摘要
        </Button>
        <Button type="button" variant="secondary" onClick={() => submit("draft")}>保存草稿</Button>
        <Button type="button" onClick={() => submit("publish")}>发布</Button>
      </div>
    </section>
  );
}
