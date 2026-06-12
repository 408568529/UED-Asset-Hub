"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { aiService } from "@/services/aiService";

export function AskUEDBox() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  async function ask() {
    const result = await aiService.askUED(question || "Portal 有哪些可复用规范？");
    setAnswer(result.answer);
  }

  return (
    <section className="rounded-[2rem] border border-foreground/10 bg-foreground p-6 text-white shadow-card">
      <div className="flex items-center gap-2 text-sm text-white/70">
        <Sparkles size={18} />
        AI Ask UED
      </div>
      <h2 className="mt-3 text-2xl font-bold">问团队资产，而不是重新翻群聊</h2>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="例如：查询条件设计规范有哪些？"
          className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/45"
        />
        <Button type="button" variant="secondary" onClick={ask}>Ask</Button>
      </div>
      {answer ? <p className="mt-4 rounded-2xl bg-white/10 p-4 text-sm leading-6 text-white/82">{answer}</p> : null}
    </section>
  );
}
