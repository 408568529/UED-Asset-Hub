"use client";
import { Button } from "antd";
export default function MicroStandardsError({ reset }: { reset: () => void }) {
  return <section className="mx-auto max-w-2xl px-6 py-16"><h1 className="text-xl font-bold">微规范存储暂不可用</h1><p className="my-4 text-muted-foreground">请由管理员核对独立存储根、索引与权限。系统不会新建空库或使用旧副本替代。</p><Button onClick={reset}>重新读取</Button></section>;
}
