"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navigacija({ veze }: { veze: { href: string; naziv: string }[] }) {
  const putanja = usePathname();

  return (
    <nav aria-label="Glavna navigacija" className="flex flex-wrap gap-2">
      {veze.map((v) => (
        <Link
          key={v.href}
          href={v.href}
          aria-current={putanja === v.href ? "page" : undefined}
          className="flex min-h-12 items-center rounded-lg border-2 border-okvir px-4 aria-[current=page]:border-akcent aria-[current=page]:bg-akcent aria-[current=page]:text-akcent-tekst"
        >
          {v.naziv}
        </Link>
      ))}
    </nav>
  );
}
