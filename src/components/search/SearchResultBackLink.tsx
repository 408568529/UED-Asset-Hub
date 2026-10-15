"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function SearchResultBackLink() {
  const returnTo = useSearchParams().get("returnTo");
  if (!returnTo || (returnTo !== "/search" && !returnTo.startsWith("/search?"))) return null;

  return <Link href={returnTo} className="search-result-back-link mb-6 inline-flex min-h-8 items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"><ArrowLeft size={16} aria-hidden="true" />返回搜索结果</Link>;
}
