import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-foreground/10 bg-foreground text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-12 text-sm text-white/62 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-4xl font-black leading-none text-white md:text-6xl">UED Asset Hub</p>
          <p className="mt-4">让团队资产像内容一样被发现、收藏和复用。</p>
        </div>
        <div className="flex gap-4">
          <Link href="/search">AI搜索</Link>
          <Link href="/me">用户中心</Link>
          <Link href="/console">管理入口</Link>
        </div>
      </div>
    </footer>
  );
}
