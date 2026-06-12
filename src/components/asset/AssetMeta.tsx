import { Bookmark, Eye, MessageCircle } from "lucide-react";
import type { Asset } from "@/types/asset";

export function AssetMeta({ asset }: { asset: Asset }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span>{asset.author.name}</span>
      <span>{asset.readTime} min read</span>
      <span className="inline-flex items-center gap-1">
        <Eye size={14} />
        {asset.views}
      </span>
      <span className="inline-flex items-center gap-1">
        <Bookmark size={14} />
        {asset.saves}
      </span>
      <span className="inline-flex items-center gap-1">
        <MessageCircle size={14} />
        {asset.commentsCount}
      </span>
    </div>
  );
}
