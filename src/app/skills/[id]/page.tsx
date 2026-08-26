import { notFound } from "next/navigation";
import { AssetDetailHeader } from "@/components/layout/AssetDetailHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { skillService } from "@/services/skillService";

export default async function SkillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const skill = await skillService.getSkillById(decodeURIComponent(id));
  if (!skill) notFound();
  const versions = await skillService.getSkillVersions(skill.id);

  return (
    <main className="page-shell page-frame">
      <AssetDetailHeader
        eyebrow="Skill Center"
        marker="SK"
        title={skill.name}
        description={skill.description}
        meta={<><p>Author · <strong className="text-foreground">{skill.authorName}</strong></p><p>Uploaded by · {skill.uploadedBy}</p><p>Updated · {skill.updatedAt.slice(0, 10)}</p><p>Version · {skill.version}</p><p>{skill.downloadCount} downloads</p></>}
        tags={<><Badge>{skill.category}</Badge><Badge>{skill.version}</Badge>{skill.usageScenarios.map((scenario) => <Badge key={scenario}>{scenario}</Badge>)}{skill.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</>}
        actions={<Button asChild variant="secondary"><a href={`/api/skills/${skill.id}/download`}>下载 Skill</a></Button>}
      />

      <section className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <article className="detail-surface p-6 md:p-8">
          <p className="section-kicker">Documentation</p>
          <h2 className="mt-3 text-2xl font-black">README</h2>
          <pre className="mt-6 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{skill.readme || "暂无 README。"}</pre>
        </article>
        <aside className="detail-surface p-6 md:p-7">
          <p className="section-kicker">Archive</p>
          <h2 className="mt-3 text-2xl font-black">Version History</h2>
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
