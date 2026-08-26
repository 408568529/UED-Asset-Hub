import Link from "next/link";
import { ArrowDownToLine, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Skill } from "@/types/skill";

export function SkillCard({ skill }: { skill: Skill }) {
  return (
    <article className="library-row">
      <div className="grid md:grid-cols-[8.5rem_minmax(0,1fr)_17rem]">
        <div className="flex items-center justify-between border-b border-border bg-[hsl(var(--surface-subtle)/0.62)] p-5 md:block md:border-b-0 md:border-r md:p-6">
          <p className="section-kicker">Package</p>
          <p className="font-mono text-3xl font-black md:mt-14">SK</p>
        </div>
        <div className="p-5 md:p-7">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Updated {skill.updatedAt.slice(0, 10)} · {skill.category} · {skill.authorName}</p>
          <Link href={`/skills/${skill.id}`}>
            <h2 className="mt-3 text-2xl font-black leading-tight tracking-[-0.02em] transition hover:text-muted-foreground">{skill.name}</h2>
          </Link>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">{skill.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {skill.usageScenarios.map((scenario) => (
              <Badge key={scenario}>{scenario}</Badge>
            ))}
            {skill.tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-between gap-5 border-t border-border p-5 md:border-l md:border-t-0 md:p-6">
          <div className="font-mono text-xs text-muted-foreground md:text-right">
            <p>{skill.version}</p>
            <p className="mt-2">{skill.downloadCount} downloads</p>
          </div>
          <div className="grid gap-2">
            <Button asChild variant="outline">
              <Link href={`/skills/${skill.id}`}>
                查看说明
                <ArrowUpRight size={16} />
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <a href={`/api/skills/${skill.id}/download`}>
                下载 Skill
                <ArrowDownToLine size={16} />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
