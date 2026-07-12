import { readJsonFile, writeJsonFile } from "@/lib/storage/jsonStorage";
import { storageFolders } from "@/config/storage";
import { diffProduct } from "@/lib/auditDiff";
import { removeStoredModuleEntry } from "@/lib/storage/deleteStoredEntry";
import { assetVersionService } from "@/services/assetVersionService";
import { operationLogService } from "@/services/operationLogService";
import type { MutationResult, DeleteResult } from "@/types/serviceResult";
import type { Product, ProductInput } from "@/types/product";

const FILE_NAME = "products.json";

function createId(name: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}`;
}

function matchesKeyword(product: Product, keyword?: string) {
  if (!keyword) return true;
  const value = `${product.name} ${product.description} ${product.link} ${(product.tags ?? []).join(" ")}`.toLowerCase();
  return value.includes(keyword.toLowerCase());
}

function sortProducts(a: Product, b: Product) {
  return (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || +new Date(b.updatedAt) - +new Date(a.updatedAt);
}

async function captureWarning(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    console.error(error);
    return "资产操作已完成，但日志或版本记录写入失败。";
  }
  return undefined;
}

export const productService = {
  async getProducts(keyword?: string): Promise<Product[]> {
    const products = await readJsonFile<Product[]>(FILE_NAME, []);
    return products
      .filter((product) => matchesKeyword(product, keyword))
      .sort(sortProducts);
  },

  async countProducts(): Promise<number> {
    return (await readJsonFile<Product[]>(FILE_NAME, [])).length;
  },

  async createProduct(input: ProductInput, operator = "admin"): Promise<MutationResult<Product>> {
    const products = await readJsonFile<Product[]>(FILE_NAME, []);
    const now = new Date().toISOString();
    const product: Product = {
      id: createId(input.name),
      name: input.name,
      description: input.description,
      link: input.link,
      coverUrl: input.coverUrl,
      tags: input.tags,
      sortOrder: input.sortOrder,
      createdAt: now,
      updatedAt: now
    };
    await writeJsonFile(FILE_NAME, [product, ...products]);
    const warning = await captureWarning(async () => {
      await operationLogService.createLog({
        type: "create",
        title: `新增资产：${product.name}`,
        description: `新增 Vibe Product「${product.name}」`,
        targetType: "asset",
        targetId: product.id,
        targetName: product.name,
        operator,
        diffSummary: ["创建资产"]
      });
    });
    return { data: product, warning };
  },

  async updateProduct(id: string, input: ProductInput, operator = "admin"): Promise<MutationResult<Product> | null> {
    const products = await readJsonFile<Product[]>(FILE_NAME, []);
    const index = products.findIndex((product) => product.id === id);
    if (index < 0) return null;

    const before = products[index];
    const diffSummary = diffProduct(before, input);
    const product = { ...products[index], ...input, updatedAt: new Date().toISOString() };
    products[index] = product;
    await writeJsonFile(FILE_NAME, products);
    const warning = await captureWarning(async () => {
      if (diffSummary.length) {
        const version = await assetVersionService.createVersion({
          assetType: "product",
          assetId: product.id,
          title: product.name,
          contentSnapshot: JSON.stringify(product, null, 2),
          changeSummary: diffSummary,
          operator
        });
        await operationLogService.createLog({
          type: "version",
          title: `更新版本：${product.name} ${version.version}`,
          description: `生成 Vibe Product 版本 ${version.version}`,
          targetType: "version",
          targetId: version.id,
          targetName: product.name,
          operator,
          diffSummary
        });
      }
      await operationLogService.createLog({
        type: "update",
        title: `编辑资产：${product.name}`,
        description: `编辑 Vibe Product「${product.name}」`,
        targetType: "asset",
        targetId: product.id,
        targetName: product.name,
        operator,
        diffSummary: diffSummary.length ? diffSummary : ["未检测到字段变化"]
      });
    });
    return { data: product, warning };
  },

  async deleteProduct(id: string, operator = "admin"): Promise<DeleteResult> {
    const products = await readJsonFile<Product[]>(FILE_NAME, []);
    const product = products.find((item) => item.id === id);
    const nextProducts = products.filter((product) => product.id !== id);
    if (nextProducts.length === products.length) return { deleted: false };
    await writeJsonFile(FILE_NAME, nextProducts);
    const warning = await captureWarning(async () => {
      await removeStoredModuleEntry(storageFolders.product, product?.name);
      await operationLogService.createLog({
        type: "delete",
        title: `删除资产：${product?.name ?? id}`,
        description: `删除 Vibe Product「${product?.name ?? id}」`,
        targetType: "asset",
        targetId: id,
        targetName: product?.name,
        operator,
        diffSummary: ["删除资产"]
      });
    });
    return { deleted: true, warning };
  },

  async getProductById(id: string): Promise<Product | null> {
    const products = await readJsonFile<Product[]>(FILE_NAME, []);
    return products.find((product) => product.id === id) ?? null;
  }
};
