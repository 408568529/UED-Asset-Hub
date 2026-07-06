import Link from "next/link";
import { ArrowDownToLine, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Skill } from "@/types/skill";

export function SkillCard({ skill }: { skill: Skill }) {
  return (
    <article className="border-t border-foreground/10 py-8">
      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <p className="font-mono text-xs text-muted-foreground">Updated {skill.updatedAt.slice(0, 10)} · {skill.category}</p>
          <Link href={`/skills/${skill.id}`}>
            <h2 className="mt-4 text-3xl font-black leading-tight transition hover:text-muted-foreground md:text-4xl">{skill.name}</h2>
          </Link>
          <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">{skill.description}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {skill.tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4 md:items-end">
          <div className="font-mono text-xs text-muted-foreground md:text-right">
            <p>{skill.version}</p>
            <p className="mt-2">{skill.downloadCount} downloads</p>
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
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
