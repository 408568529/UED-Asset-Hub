import Link from "next/link";
import { TopicCard } from "@/components/topic/TopicCard";
import { Button } from "@/components/ui/button";
import type { Topic } from "@/types/topic";

export function TopicSection({ topics }: { topics: Topic[] }) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-10">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-black">专题精选</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">把零散资产组织成可阅读、可学习、可复用的主题路径。</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/topics">全部专题</Link>
        </Button>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {topics.slice(0, 3).map((topic) => (
          <TopicCard key={topic.id} topic={topic} />
        ))}
      </div>
    </section>
  );
}
