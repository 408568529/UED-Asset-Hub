"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";
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
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, ease: "easeOut" }}
      className="bg-[#0c0c0c] p-7 text-white md:p-12"
    >
      <div className="flex items-center gap-2 text-xs font-bold uppercase text-primary">
        <Sparkles size={18} />
        AI Ask UED
      </div>
      <h2 className="mt-8 max-w-4xl text-5xl font-black uppercase leading-none md:text-7xl">Ask The Archive.</h2>
      <p className="mt-5 max-w-2xl text-base leading-7 text-white/56">问团队资产，而不是重新翻群聊。</p>
      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="例如：查询条件设计规范有哪些？"
          className="min-w-0 flex-1 rounded-full border border-white/20 bg-white/8 px-5 py-4 text-sm text-white outline-none placeholder:text-white/45"
        />
        <Button type="button" variant="secondary" onClick={ask}>Ask</Button>
      </div>
      {answer ? <p className="mt-6 border-t border-white/15 pt-6 text-sm leading-7 text-white/72">{answer}</p> : null}
    </motion.section>
  );
}
