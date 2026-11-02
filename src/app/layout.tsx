import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smajić – Narudžbe",
  description: "Narudžbe i naplata za restoran Smajić",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="bs" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
