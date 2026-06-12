import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { categories } from "@/data/mock/categories";

export function SearchFilters({ selectedCategory }: { selectedCategory?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link href="/search">
        <Badge className={!selectedCategory ? "border-foreground bg-foreground text-white" : ""}>全部</Badge>
      </Link>
      {categories.map((category) => (
        <Link key={category.id} href={`/search?category=${category.id}`}>
          <Badge className={selectedCategory === category.id ? "border-foreground bg-foreground text-white" : ""}>{category.name}</Badge>
        </Link>
      ))}
    </div>
  );
}
