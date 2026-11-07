"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// dno: on a phone the bar sits at the bottom, under the thumb; from md up it is the usual row in the header.
export default function Navigacija({ veze, dno = false }: { veze: { href: string; naziv: string }[]; dno?: boolean }) {
  const putanja = usePathname();
  // Longest prefix wins, so /sefica/dan marks "Zatvaranje dana", not "Izvještaji".
  const aktivna = veze
    .filter((v) => putanja === v.href || putanja.startsWith(`${v.href}/`))
    .reduce<string | undefined>((a, v) => (a && a.length >= v.href.length ? a : v.href), undefined);

  return (
    <nav
      aria-label="Glavna navigacija"
      className={
        dno
          ? "fixed inset-x-0 bottom-0 z-40 grid auto-cols-fr grid-flow-col gap-1 border-t-2 border-dim bg-base-100 p-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:static md:flex md:flex-wrap md:gap-2 md:border-0 md:bg-transparent md:p-0"
          : "flex flex-wrap gap-2"
      }
    >
      {veze.map((v) => (
        <Link
          key={v.href}
          href={v.href}
          aria-current={aktivna === v.href ? "page" : undefined}
          className={`btn btn-lg btn-outline border-dim font-bold aria-[current=page]:border-base-content aria-[current=page]:bg-base-content aria-[current=page]:text-base-100${
            dno ? " max-md:h-14 max-md:border-0 max-md:px-1 max-md:text-xs max-md:leading-tight max-md:whitespace-normal" : ""
          }`}
        >
          {v.naziv}
        </Link>
      ))}
    </nav>
  );
}
