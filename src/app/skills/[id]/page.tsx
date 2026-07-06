import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { skillService } from "@/services/skillService";

export default async function SkillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const skill = await skillService.getSkillById(decodeURIComponent(id));
  if (!skill) notFound();
  const versions = await skillService.getSkillVersions(skill.id);

  return (
    <main className="mx-auto max-w-7xl px-5 py-20 md:py-28">
      <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Skill Center</p>
      <h1 className="mt-6 max-w-5xl text-2xl font-black leading-tight md:text-3xl">{skill.name}</h1>
      <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">{skill.description}</p>
      <div className="mt-8 flex flex-wrap gap-2">
        <Badge>{skill.category}</Badge>
        <Badge>{skill.version}</Badge>
        {skill.tags.map((tag) => (
          <Badge key={tag}>{tag}</Badge>
        ))}
      </div>
      <div className="mt-8">
        <Button asChild>
          <a href={`/api/skills/${skill.id}/download`}>下载 Skill</a>
        </Button>
      </div>

      <section className="mt-24 grid gap-12 lg:grid-cols-[1fr_360px]">
        <div className="bg-white p-6 md:p-8">
          <h2 className="text-2xl font-black">README</h2>
          <pre className="mt-6 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{skill.readme || "暂无 README。"}</pre>
        </div>
        <aside className="bg-white/70 p-6 md:p-8">
          <h2 className="text-2xl font-black">Version History</h2>
          <div className="mt-6">
            {versions.map((version) => (
              <div key={version.id} className="border-b border-foreground/[0.08] py-5">
                <p className="font-bold">{version.version}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{version.changeLog}</p>
                <a className="mt-3 inline-block text-sm font-bold underline" href={`/api/skills/${skill.id}/download?versionId=${version.id}`}>
                  下载该版本
                </a>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
