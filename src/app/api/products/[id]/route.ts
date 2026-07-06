import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { productService } from "@/services/productService";
import type { ProductInput } from "@/types/product";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const product = await productService.updateProduct(id, (await request.json()) as ProductInput);
  if (!product) return NextResponse.json({ message: "Not found" }, { status: 404 });
  return NextResponse.json(product);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  return NextResponse.json(await productService.deleteProduct(id));
}
