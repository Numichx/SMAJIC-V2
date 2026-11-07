import type { Metadata } from "next";
import { Barlow } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

// One family for text and numbers; Barlow has the č, ć, đ, š, ž of latin-ext and tabular figures.
const barlow = Barlow({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700", "800"], variable: "--font-barlow" });

export const viewport = { viewportFit: "cover" as const };

export const metadata: Metadata = {
  title: "Smajić – Narudžbe",
  description: "Narudžbe i naplata za restoran Smajić",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading a cookie also renders every page per request, which the CSP nonce requires.
  const tema = (await cookies()).get("tema")?.value;

  return (
    <html
      lang="bs"
      data-theme={tema === "svijetla" ? "svijetla" : "tamna"}
      className={`h-full antialiased ${barlow.variable}`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
