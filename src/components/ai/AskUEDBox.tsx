"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aiService } from "@/services/aiService";

export function AskUEDBox() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  async function ask() {
    const result = await aiService.askUED(question || "Portal 有哪些可复用规范？");
    setAnswer(result.answer);
  }

  return (
    <section className="rounded-[2.5rem] bg-foreground p-8 text-white md:p-12">
      <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-white/60">
        <Sparkles size={18} />
        AI Ask UED
      </div>
      <h2 className="mt-6 max-w-4xl text-4xl font-black leading-[1.02] md:text-6xl">问团队资产，而不是重新翻群聊</h2>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="例如：查询条件设计规范有哪些？"
          controlSize="lg"
          className="min-w-0 flex-1"
        />
        <Button type="button" variant="secondary" onClick={ask}>Ask</Button>
      </div>
      {answer ? <p className="mt-4 rounded-2xl bg-white/10 p-4 text-sm leading-6 text-white/82">{answer}</p> : null}
    </section>
  );
}
