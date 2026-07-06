import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SectionHeading({
  index,
  eyebrow,
  title,
  description,
  href,
  action = "查看全部"
}: {
  index: string;
  eyebrow: string;
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="mb-10 border-t border-foreground/15 pt-6 md:mb-14">
      <div className="grid gap-6 md:grid-cols-[160px_1fr_auto] md:items-start">
        <div className="font-mono text-sm text-muted-foreground">{index} — {eyebrow}</div>
        <div>
          <h2 className="max-w-4xl text-4xl font-black leading-[1.02] tracking-normal md:text-6xl">{title}</h2>
          <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">{description}</p>
        </div>
        {href ? (
          <Button asChild variant="ghost" className="justify-self-start md:justify-self-end">
            <Link href={href}>
              {action}
              <ArrowRight size={16} />
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
