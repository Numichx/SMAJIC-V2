import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";

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
      data-tema={tema === "tamna" || tema === "svijetla" ? tema : undefined}
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
