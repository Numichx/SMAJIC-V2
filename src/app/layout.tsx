import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next, Big_Shoulders } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible_Next({ subsets: ["latin", "latin-ext"], weight: ["400", "700"], variable: "--font-atkinson" });
// Variable font so the optical-size axis is kept for the big numbers; condensed figures fit more digits at 3 m.
const bigShoulders = Big_Shoulders({ subsets: ["latin", "latin-ext"], axes: ["opsz"], variable: "--font-big-shoulders" });

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
      className={`h-full antialiased ${atkinson.variable} ${bigShoulders.variable}`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
