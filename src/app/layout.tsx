import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next, Space_Grotesk } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible_Next({ subsets: ["latin", "latin-ext"], weight: ["400", "700"], variable: "--font-atkinson" });
// Table numbers, timers and headings: wide figures read from across the kitchen.
const spaceGrotesk = Space_Grotesk({ subsets: ["latin", "latin-ext"], variable: "--font-space-grotesk" });

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
      className={`h-full antialiased ${atkinson.variable} ${spaceGrotesk.variable}`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
