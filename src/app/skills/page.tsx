import { SkillCard } from "@/components/skill/SkillCard";
import { ModulePageHeader } from "@/components/layout/ModulePageHeader";
import { Input } from "@/components/ui/input";
import { skillService } from "@/services/skillService";

export default async function SkillsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const skills = await skillService.getSkills(q);

  return (
    <main className="page-shell page-frame">
      <ModulePageHeader eyebrow="Skill Center" title="团队 AI 技能中心" description="浏览、查看说明、下载和持续更新团队 Skill 包。" count={skills.length}>
        <form action="/skills">
          <Input name="q" defaultValue={q} placeholder="搜索 Skill 名称、介绍或标签" controlSize="lg" />
        </form>
      </ModulePageHeader>

      <section className="library-list mt-10 md:mt-12">
        {skills.map((skill) => (
          <SkillCard key={skill.id} skill={skill} />
        ))}
        {!skills.length ? <p className="border-b border-foreground/[0.08] py-12 text-muted-foreground">暂无匹配的 Skill 资产。</p> : null}
      </section>
    </main>
  );
}
