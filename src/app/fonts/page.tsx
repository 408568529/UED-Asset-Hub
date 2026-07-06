import { FontCard } from "@/components/font/FontCard";
import { Input } from "@/components/ui/input";
import { fontService } from "@/services/fontService";

export default async function FontsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const fonts = await fontService.getFonts(q);

  return (
    <main className="mx-auto max-w-7xl px-5 py-20 md:py-28">
      <div className="grid gap-8 md:grid-cols-[1fr_360px] md:items-end">
        <div>
          <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Font Library</p>
          <h1 className="mt-6 max-w-5xl text-2xl font-black leading-tight md:text-3xl">团队字体资源库</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">统一管理字体资源、版本、授权说明、在线预览和下载统计。</p>
        </div>
        <form action="/fonts" className="bg-white p-1 shadow-[0_18px_60px_rgba(0,0,0,0.05)]">
          <Input name="q" defaultValue={q} placeholder="搜索字体名称、介绍或标签" className="border-0 bg-transparent focus:ring-0" />
        </form>
      </div>
      <section className="mt-24">
        {fonts.map((font) => <FontCard key={font.id} font={font} />)}
        {!fonts.length ? <p className="py-8 text-muted-foreground">暂无字体资产，请在管理台上传。</p> : null}
      </section>
    </main>
  );
}
