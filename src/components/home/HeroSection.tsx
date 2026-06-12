import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchBox } from "@/components/search/SearchBox";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 md:grid-cols-[1.05fr_0.95fr] md:items-center md:py-20">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-4 py-2 text-sm text-muted-foreground shadow-card backdrop-blur">
            <Sparkles size={16} className="text-primary" />
            Design Asset Community
          </div>
          <h1 className="mt-6 max-w-3xl text-5xl font-black leading-[1.02] tracking-normal text-foreground md:text-7xl">
            让团队资产像内容一样被发现
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            汇聚 Vibe Product、SOP、组件规范、项目沉淀和 Prompt，让设计经验以卡片、专题和 AI 问答的方式被浏览、收藏与复用。
          </p>
          <div className="mt-8 max-w-2xl">
            <SearchBox />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/topics">
                浏览专题
                <ArrowRight size={16} />
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/search">进入 AI 搜索</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[2rem] bg-[#111827] p-5 text-white shadow-card">
            <p className="text-sm text-white/60">Today featured</p>
            <h2 className="mt-3 text-3xl font-bold">Portal改版沉淀</h2>
            <p className="mt-4 text-sm leading-6 text-white/70">从导航、信息架构到组件范式，沉淀为可被复用的设计体系。</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-[1.5rem] bg-white p-5 shadow-card">
              <p className="text-3xl font-black">18</p>
              <p className="mt-1 text-sm text-muted-foreground">精选资产</p>
            </div>
            <div className="rounded-[1.5rem] bg-[#d8f36a] p-5 shadow-card">
              <p className="text-3xl font-black">5</p>
              <p className="mt-1 text-sm text-foreground/70">专题策展</p>
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-white/70 bg-white/80 p-5 shadow-card">
            <p className="text-sm font-medium">AI Ask UED</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">“查询条件设计规范有哪些？” “云资金账户限制集做过什么方案？”</p>
          </div>
        </div>
      </div>
    </section>
  );
}
