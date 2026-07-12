import { Star } from "lucide-react";

export function formatTrainingRating(rating?: number) {
  return rating ? `${rating} 星` : "未评分";
}

export function TrainingRating({ rating, showLabel = false }: { rating?: number; showLabel?: boolean }) {
  if (!rating) return showLabel ? <span className="text-sm text-muted-foreground">未评分</span> : null;

  return (
    <span className="inline-flex items-center gap-0.5 text-amber-400" aria-label={`推荐指数 ${rating} / 5`} title={`推荐指数 ${rating} / 5`}>
      {Array.from({ length: 5 }, (_, index) => <Star key={index} size={15} fill={index < rating ? "currentColor" : "none"} className={index < rating ? "text-amber-400" : "text-foreground/20"} />)}
      {showLabel ? <span className="ml-2 text-sm font-bold text-foreground">{rating}.0 / 5</span> : null}
    </span>
  );
}
