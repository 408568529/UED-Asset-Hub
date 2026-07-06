import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { productService } from "@/services/productService";
import type { ProductInput } from "@/types/product";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return NextResponse.json(await productService.getProducts(searchParams.get("q") ?? undefined));
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as ProductInput;
  const result = await productService.createProduct(body);
  return NextResponse.json(result, { status: 201 });
}
