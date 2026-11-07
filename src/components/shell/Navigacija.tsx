"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navigacija({ veze }: { veze: { href: string; naziv: string }[] }) {
  const putanja = usePathname();
  // Longest prefix wins, so /sefica/dan marks "Zatvaranje dana", not "Izvještaji".
  const aktivna = veze
    .filter((v) => putanja === v.href || putanja.startsWith(`${v.href}/`))
    .reduce<string | undefined>((a, v) => (a && a.length >= v.href.length ? a : v.href), undefined);

  return (
    <nav aria-label="Glavna navigacija" className="flex flex-wrap gap-2">
      {veze.map((v) => (
        <Link
          key={v.href}
          href={v.href}
          aria-current={aktivna === v.href ? "page" : undefined}
          className="btn btn-lg btn-outline border-dim font-bold aria-[current=page]:border-base-content aria-[current=page]:bg-base-content aria-[current=page]:text-base-100"
        >
          {v.naziv}
        </Link>
      ))}
    </nav>
  );
}
