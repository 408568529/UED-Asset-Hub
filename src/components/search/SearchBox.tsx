"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SearchBox({ placeholder = "搜索 Portal、组件规范、Prompt、项目沉淀..." }: { placeholder?: string }) {
  const [keyword, setKeyword] = useState("");
  const router = useRouter();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(`/search?q=${encodeURIComponent(keyword)}`);
  }

  return (
    <form onSubmit={submit} className="flex w-full items-center gap-2 rounded-full border border-white/80 bg-white p-2 shadow-card">
      <Search className="ml-3 text-muted-foreground" size={20} />
      <input
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none md:text-base"
      />
      <Button type="submit" size="lg">搜索</Button>
    </form>
  );
}
