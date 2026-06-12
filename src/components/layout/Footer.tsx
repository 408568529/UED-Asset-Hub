import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-black/10 bg-[#0c0c0c] text-white">
      <div className="brand-container flex flex-col gap-8 py-12 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-5xl font-black uppercase leading-none md:text-7xl">UED Asset Hub</p>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/55">让团队资产像内容一样被发现、收藏和复用。</p>
        </div>
        <div className="flex gap-4 text-sm text-white/65">
          <Link href="/search">AI搜索</Link>
          <Link href="/me">用户中心</Link>
          <Link href="/console">管理入口</Link>
        </div>
      </div>
    </footer>
  );
}
