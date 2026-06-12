import { TopicCard } from "@/components/topic/TopicCard";
import { topicService } from "@/services/topicService";

export default async function TopicsPage() {
  const topics = await topicService.getTopics();

  return (
    <div className="mx-auto max-w-7xl px-5 py-12">
      <div className="mb-8">
        <p className="text-sm font-medium text-primary">Curated collections</p>
        <h1 className="mt-3 text-5xl font-black">专题</h1>
        <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">围绕项目、规范、AI 工作流和团队经验组织内容，让资产从“单篇笔记”变成“学习路径”。</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {topics.map((topic) => (
          <TopicCard key={topic.id} topic={topic} />
        ))}
      </div>
    </div>
  );
}
