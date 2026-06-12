import Image from "next/image";
import { notFound } from "next/navigation";
import { AssetGrid } from "@/components/asset/AssetGrid";
import { Badge } from "@/components/ui/badge";
import { topicService } from "@/services/topicService";

export default async function TopicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [topic, assets] = await Promise.all([topicService.getTopicById(id), topicService.getTopicAssets(id)]);
  if (!topic) {
    notFound();
    return null;
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-12">
      <section className="overflow-hidden rounded-[2rem] bg-white shadow-card">
        <div className="relative aspect-[21/8] min-h-72">
          <Image src={topic.coverUrl} alt={topic.title} fill className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute bottom-0 max-w-3xl p-8 text-white">
            <div className="flex flex-wrap gap-2">
              {topic.tags.map((tag) => (
                <Badge key={tag} className="border-white/25 bg-white/15 text-white">{tag}</Badge>
              ))}
            </div>
            <h1 className="mt-4 text-5xl font-black">{topic.title}</h1>
            <p className="mt-4 text-base leading-8 text-white/78">{topic.description}</p>
          </div>
        </div>
      </section>
      <div className="mt-10">
        <h2 className="mb-6 text-3xl font-black">专题包含内容</h2>
        <AssetGrid assets={assets} />
      </div>
    </div>
  );
}
