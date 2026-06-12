import Link from "next/link";
import { TopicCard } from "@/components/topic/TopicCard";
import { Button } from "@/components/ui/button";
import type { Topic } from "@/types/topic";
import { SectionHeader } from "./SectionHeader";

export function TopicSection({ index = "02", topics }: { index?: string; topics: Topic[] }) {
  return (
    <section className="brand-container py-16 md:py-24">
      <div className="relative">
        <SectionHeader
          index={index}
          eyebrow="Featured Topics"
          title="Curated Knowledge Paths"
          description="把零散资产组织成可阅读、可学习、可复用的主题路径。"
        />
        <Button asChild variant="outline" className="mb-8 md:absolute md:right-0 md:top-5 md:mb-0">
          <Link href="/topics">全部专题</Link>
        </Button>
      </div>
      <div className="grid gap-4">
        {topics.slice(0, 5).map((topic, topicIndex) => (
          <TopicCard key={topic.id} topic={topic} index={topicIndex + 1} />
        ))}
      </div>
    </section>
  );
}
