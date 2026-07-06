import { TopicCard } from "@/components/topic/TopicCard";
import { Reveal } from "@/components/motion/Reveal";
import { SectionHeading } from "@/components/home/SectionHeading";
import type { Topic } from "@/types/topic";

export function TopicSection({ topics }: { topics: Topic[] }) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-16 md:py-24">
      <Reveal>
        <SectionHeading
          index="02"
          eyebrow="Featured Topics"
          title="专题像作品集一样展开"
          description="把零散资产组织成有策展逻辑的主题路径，让团队经验更容易被浏览和复用。"
          href="/topics"
          action="全部专题"
        />
      </Reveal>
      <div className="grid gap-10 lg:grid-cols-2">
        {topics.slice(0, 4).map((topic, index) => (
          <Reveal key={topic.id} delay={index * 0.05}>
            <TopicCard topic={topic} index={index} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
