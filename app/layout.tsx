import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "票税 · 发票与税负工作台",
  description:
    "导入进项与销项发票，按票种与税率自动汇总，计算当月应缴增值税、附加税费与所得税估算。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
