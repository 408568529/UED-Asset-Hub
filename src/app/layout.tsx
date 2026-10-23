import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { AppChrome } from "@/components/layout/AppChrome";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "UED Asset Hub",
  description: "团队设计资产、Skill、Prompt、培训资料与测试环境入口"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body><AntdRegistry><AppChrome>{children}</AppChrome></AntdRegistry></body>
    </html>
  );
}
