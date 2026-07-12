"use client";

import { useState } from "react";
import { PromptCard } from "@/components/prompt/PromptCard";
import type { PromptAsset } from "@/types/prompt";

export function PromptList({ prompts }: { prompts: PromptAsset[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return prompts.map((prompt) => (
    <PromptCard
      key={prompt.id}
      prompt={prompt}
      expanded={expandedId === prompt.id}
      onToggle={() => setExpandedId((current) => current === prompt.id ? null : prompt.id)}
    />
  ));
}
