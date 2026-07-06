import { SkillCard } from "@/components/skill/SkillCard";
import { Input } from "@/components/ui/input";
import { skillService } from "@/services/skillService";

export default async function SkillsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const skills = await skillService.getSkills(q);

  return (
    <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
      <div className="grid gap-8 md:grid-cols-[1fr_360px] md:items-end">
        <div>
          <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Skill Center</p>
          <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">团队 AI 技能中心</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">浏览、查看说明、下载和持续更新团队 Skill 包。</p>
        </div>
        <form action="/skills" className="rounded-full border border-foreground/15 bg-white p-2">
          <Input name="q" defaultValue={q} placeholder="搜索 Skill 名称、介绍或标签" className="border-0 bg-transparent focus:ring-0" />
        </form>
      </div>

      <section className="mt-14">
        {skills.map((skill) => (
          <SkillCard key={skill.id} skill={skill} />
        ))}
        {!skills.length ? <p className="border-t border-foreground/10 py-8 text-muted-foreground">暂无 Skill 资产。</p> : null}
      </section>
    </main>
  );
}
