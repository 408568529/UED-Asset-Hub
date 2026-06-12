import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-border bg-white/70">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-10 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p>UED Asset Hub · 让团队资产像内容一样被发现、收藏和复用。</p>
        <div className="flex gap-4">
          <Link href="/search">AI搜索</Link>
          <Link href="/me">用户中心</Link>
          <Link href="/console">管理入口</Link>
        </div>
      </div>
    </footer>
  );
}
