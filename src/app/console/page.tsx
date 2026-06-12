import { Badge } from "@/components/ui/badge";

const modules = ["内容管理", "分类管理", "标签管理", "专题管理", "用户管理", "AI模型配置"];

export default function ConsolePage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="mb-8">
        <Badge>Admin Preview</Badge>
        <h1 className="mt-4 text-5xl font-black">轻量管理入口</h1>
        <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">
          这里只预留管理员工作台能力，不改变主产品的内容社区体验。后续可接入 RBAC、审核流、模型配置和内容统计。
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => (
          <section key={module} className="rounded-[1.5rem] bg-white p-6 shadow-card">
            <h2 className="text-2xl font-bold">{module}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">占位模块。后续接入真实 API、权限策略和运营配置。</p>
          </section>
        ))}
      </div>
    </div>
  );
}
