import { PublishForm } from "./publish-form";

export default function PublishPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <div className="mb-8">
        <p className="text-sm font-medium text-primary">Publish</p>
        <h1 className="mt-3 text-5xl font-black">发布团队资产</h1>
        <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">当前为前端表单占位，后续接入登录、草稿、文件上传、权限和审核流程。</p>
      </div>
      <PublishForm />
    </div>
  );
}
