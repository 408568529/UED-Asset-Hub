import Link from "next/link";
import { Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { categories } from "@/data/mock/categories";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/10 bg-[#f6f4ee]/88 backdrop-blur-xl">
      <div className="brand-container flex items-center justify-between gap-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-sm font-black text-white">U</span>
          <span>
            <span className="block text-sm font-black uppercase leading-4 tracking-normal">UED Asset Hub</span>
            <span className="block text-[11px] uppercase text-muted-foreground">Design Asset Community</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/category/${category.id}`}
              className="rounded-full px-3 py-2 text-[13px] uppercase text-muted-foreground transition hover:bg-black hover:text-white"
            >
              {category.name}
            </Link>
          ))}
          <Link href="/topics" className="rounded-full px-3 py-2 text-[13px] uppercase text-muted-foreground transition hover:bg-black hover:text-white">
            专题
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label="搜索">
            <Link href="/search">
              <Search size={18} />
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/publish">
              <Sparkles size={16} />
              发布资产
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
