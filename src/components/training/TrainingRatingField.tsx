"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TrainingRatingField({ value, onChange }: { value?: number; onChange: (rating?: number) => void }) {
  const [preview, setPreview] = useState<number | undefined>();
  const visibleRating = preview ?? value ?? 0;

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const current = value ?? 0;
    let next: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = Math.min(5, Math.max(1, current || index + 1) + 1);
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = Math.max(1, (current || index + 1) - 1);
    if (event.key === "Home") next = 1;
    if (event.key === "End") next = 5;
    if (next === undefined) return;
    event.preventDefault();
    onChange(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="推荐指数">
      {Array.from({ length: 5 }, (_, index) => {
        const rating = index + 1;
        return (
          <Button
            key={rating}
            type="button"
            variant="ghost"
            size="icon"
            role="radio"
            aria-checked={value === rating}
            aria-label={`${rating} 星`}
            title={`${rating} 星`}
            onMouseEnter={() => setPreview(rating)}
            onMouseLeave={() => setPreview(undefined)}
            onFocus={() => setPreview(rating)}
            onBlur={() => setPreview(undefined)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onClick={() => onChange(rating)}
            className="h-9 w-9 text-foreground hover:bg-muted"
          >
            <Star size={20} fill={rating <= visibleRating ? "currentColor" : "none"} className={rating <= visibleRating ? "text-amber-400" : "text-foreground/25"} />
          </Button>
        );
      })}
      <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)} disabled={!value}>清空评分</Button>
      <span className="ml-1 text-xs text-muted-foreground">{value ? `${value} / 5` : "未评分"}</span>
    </div>
  );
}
