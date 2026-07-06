import type { ComponentSpec, ComponentSpecInput } from "@/types/componentSpec";
import type { Product, ProductInput } from "@/types/product";

function textChange(label: string, before?: string, after?: string) {
  if ((before ?? "") === (after ?? "")) return null;
  if (!before && after) return `新增${label}`;
  if (before && !after) return `删除${label}`;
  return `${label}由「${before}」修改为「${after}」`;
}

function tagsChange(before: string[] = [], after: string[] = []) {
  const added = after.filter((tag) => !before.includes(tag));
  const removed = before.filter((tag) => !after.includes(tag));
  return [
    ...added.map((tag) => `标签新增「${tag}」`),
    ...removed.map((tag) => `标签删除「${tag}」`)
  ];
}

function sortOrderChange(before?: number, after?: number) {
  if (before === after) return null;
  if (before === undefined && after !== undefined) return `新增排序值「${after}」`;
  if (before !== undefined && after === undefined) return "删除排序值";
  return `排序值由「${before}」修改为「${after}」`;
}

export function diffProduct(before: Product, after: ProductInput) {
  return [
    textChange("产品名称", before.name, after.name),
    textChange("产品介绍", before.description, after.description),
    textChange("产品链接", before.link, after.link),
    textChange("封面图链接", before.coverUrl, after.coverUrl),
    sortOrderChange(before.sortOrder, after.sortOrder),
    ...tagsChange(before.tags, after.tags)
  ].filter(Boolean) as string[];
}

export function diffComponent(before: ComponentSpec, after: ComponentSpecInput) {
  return [
    textChange("组件名称", before.name, after.name),
    textChange("组件介绍", before.description, after.description),
    textChange("规范链接", before.docLink, after.docLink),
    textChange("Figma链接", before.figmaLink, after.figmaLink),
    sortOrderChange(before.sortOrder, after.sortOrder),
    ...tagsChange(before.tags, after.tags)
  ].filter(Boolean) as string[];
}
