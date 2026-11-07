"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// bocno: from md up the links stack in the sidebar. dno: on a phone they sit in a bottom bar, under the thumb.
export default function Navigacija({ veze, dno = false, bocno = false }: { veze: { href: string; naziv: string }[]; dno?: boolean; bocno?: boolean }) {
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
          ? "fixed inset-x-0 bottom-0 z-40 grid auto-cols-fr grid-flow-col gap-1 border-t-2 border-dim bg-base-200 p-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:static md:flex md:flex-col md:gap-1 md:border-0 md:bg-transparent md:p-0"
          : bocno
            ? "flex flex-wrap gap-2 md:flex-col md:flex-nowrap md:gap-1"
            : "flex flex-wrap gap-2"
      }
    >
      {veze.map((v) => (
        <Link
          key={v.href}
          href={v.href}
          aria-current={aktivna === v.href ? "page" : undefined}
          className={`btn btn-lg btn-outline border-dim font-bold aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-content ${
            bocno ? "md:h-11 md:min-h-11 md:justify-start md:border-transparent md:text-dim" : ""
          } ${dno ? "max-md:h-14 max-md:border-0 max-md:px-1 max-md:text-xs max-md:leading-tight max-md:whitespace-normal" : ""}`}
        >
          {v.naziv}
        </Link>
      ))}
    </nav>
  );
}
