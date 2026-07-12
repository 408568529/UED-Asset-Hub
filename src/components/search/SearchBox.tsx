"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SearchBox({ placeholder = "搜索产品、Skill、字体、Prompt 与规范..." }: { placeholder?: string }) {
  const [keyword, setKeyword] = useState("");
  const router = useRouter();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(`/search?q=${encodeURIComponent(keyword)}`);
  }

  return (
    <form onSubmit={submit} className="flex w-full items-center gap-2">
      <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-muted-foreground" size={19} aria-hidden="true" />
      <Input
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        placeholder={placeholder}
        aria-label="搜索团队资产"
        controlSize="lg"
        className="pl-11"
      />
      </div>
      <Button type="submit" size="lg" variant="secondary" className="min-w-24">搜索</Button>
    </form>
  );
}
