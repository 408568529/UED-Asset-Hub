import Link from "next/link";
import { ArrowDownToLine, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Skill } from "@/types/skill";

export function SkillCard({ skill }: { skill: Skill }) {
  return (
    <article className="border-b border-foreground/[0.08] py-10 transition hover:bg-white/55 md:-mx-6 md:px-6">
      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <p className="font-mono text-xs text-muted-foreground">Updated {skill.updatedAt.slice(0, 10)} · {skill.category}</p>
          <Link href={`/skills/${skill.id}`}>
            <h2 className="mt-4 text-2xl font-black leading-tight transition hover:text-muted-foreground">{skill.name}</h2>
          </Link>
          <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">{skill.description}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {skill.tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4 md:items-end md:pt-8">
          <div className="font-mono text-xs text-muted-foreground md:text-right">
            <p>{skill.version}</p>
            <p className="mt-2">{skill.downloadCount} downloads</p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
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
