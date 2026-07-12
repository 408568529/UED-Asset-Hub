import { FontCard } from "@/components/font/FontCard";
import { ModulePageHeader } from "@/components/layout/ModulePageHeader";
import { Input } from "@/components/ui/input";
import { fontService } from "@/services/fontService";

export default async function FontsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const fonts = await fontService.getFonts(q);

  return (
    <main className="mx-auto max-w-7xl px-5 py-20 md:py-28">
      <ModulePageHeader eyebrow="Font Library" title="团队字体资源库" description="统一管理字体资源、版本、授权说明、在线预览和下载统计。" count={fonts.length}>
        <form action="/fonts">
          <Input name="q" defaultValue={q} placeholder="搜索字体名称、介绍或标签" controlSize="lg" />
        </form>
      </ModulePageHeader>
      <section className="mt-16 md:mt-20">
        {fonts.map((font) => <FontCard key={font.id} font={font} />)}
        {!fonts.length ? <p className="border-b border-foreground/[0.08] py-12 text-muted-foreground">暂无匹配的字体资产，请在管理台上传。</p> : null}
      </section>
    </main>
  );
}
