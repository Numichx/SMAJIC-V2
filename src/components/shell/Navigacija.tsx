"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// One stroke icon per link, keyed by href; a link without one just shows its label.
const P = {
  stolovi: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  meni: "M4 6h16M4 12h16M4 18h10",
  sank: "M6 3h12l-1.5 16a2 2 0 0 1-2 1.8h-5a2 2 0 0 1-2-1.8zM6.5 8h11",
  kalendar: "M3 5h18v16H3zM16 2v4M8 2v4M3 10h18",
  grafikon: "M3 3v18h18M7 15l4-4 3 3 5-6",
  red: "M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01",
  kutija: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8",
  popis: "M9 3h6v4H9zM7 5H5v16h14V5h-2M9 12h6M9 16h6",
  dug: "M3 7h18v12H3zM16 13h2M3 7l3-4h12l3 4",
  dan: "M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z",
  sat: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 3",
  knjiga: "M4 4h10a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4zM4 16a4 4 0 0 1 4-4h10",
  ljudi: "M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  dnevnik: "M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6",
  racun: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  stit: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  pomoc: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01",
};
const IKONA: Record<string, string> = {
  "/konobar": P.stolovi,
  "/konobar/meni": P.meni,
  "/sank": P.sank,
  "/konobar/rezervacije": P.kalendar,
  "/konobar/statistika": P.grafikon,
  "/kuhinja": P.red,
  "/pecenjara": P.red,
  "/kuhinja/mesnica": P.kutija,
  "/mesnica": P.kutija,
  "/pecenjara/popis": P.popis,
  "/pecenjara/dugovi": P.dug,
  "/sefica": P.grafikon,
  "/sefica/dan": P.dan,
  "/sefica/smjene": P.sat,
  "/sefica/pecenjara": P.popis,
  "/sefica/zaliha": P.kutija,
  "/sefica/recepti": P.knjiga,
  "/sefica/meni": P.meni,
  "/sefica/dugovi": P.dug,
  "/sefica/administracija": P.ljudi,
  "/sefica/dnevnik": P.dnevnik,
  "/sefica/z": P.racun,
  "/sefica/privatnost": P.stit,
  "/pomoc": P.pomoc,
};

// bocno: from md up the links stack in the sidebar. dno: on a phone they sit in a bottom bar, under the thumb.
export default function Navigacija({ veze, dno = false, bocno = false }: { veze: { href: string; naziv: string }[]; dno?: boolean; bocno?: boolean }) {
  const putanja = usePathname();
  // Longest prefix wins, so /sefica/dan marks "Zatvaranje dana", not "Izvještaji".
  const aktivna = veze
    .filter((v) => putanja === v.href || putanja.startsWith(`${v.href}/`))
    .reduce<string | undefined>((a, v) => (a && a.length >= v.href.length ? a : v.href), undefined);

  // Without a bottom bar, a phone shows one button naming the current page; the links open under it.
  const [otvoren, postaviOtvoren] = useState(false);
  const sklopivo = !dno;
  const trenutna = veze.find((v) => v.href === aktivna)?.naziv ?? "Izbornik";

  return (
    <>
      {sklopivo && (
        <button
          type="button"
          aria-expanded={otvoren}
          aria-controls="glavna-navigacija"
          onClick={() => postaviOtvoren((o) => !o)}
          className="btn btn-lg btn-outline border-dim font-bold md:hidden max-md:h-11 max-md:max-w-44 max-md:px-3 max-md:text-sm"
        >
          <span className="sr-only">Izbornik: </span>
          <span className="truncate">{trenutna}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`size-4 flex-none transition-transform motion-reduce:transition-none ${otvoren ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
      <nav
        id="glavna-navigacija"
        aria-label="Glavna navigacija"
        className={`${
          dno
            ? "fixed inset-x-0 bottom-0 z-40 grid auto-cols-fr grid-flow-col gap-1 border-t-2 border-dim bg-base-200 p-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:static md:flex md:flex-col md:gap-1 md:border-0 md:bg-transparent md:p-0"
            : bocno
              ? "flex flex-wrap gap-2 md:flex-col md:flex-nowrap md:gap-1"
              : "flex flex-wrap gap-2"
        } ${sklopivo ? `max-md:order-last max-md:grid max-md:w-full max-md:grid-cols-2 ${otvoren ? "" : "max-md:hidden"}` : ""}`}
      >
        {veze.map((v) => (
          <Link
            key={v.href}
            href={v.href}
            aria-current={aktivna === v.href ? "page" : undefined}
            onClick={() => postaviOtvoren(false)}
            className={`btn btn-lg btn-outline border-dim font-bold aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-content ${
              bocno ? "md:h-11 md:min-h-11 md:justify-start md:border-transparent md:text-dim" : ""
            } ${dno ? "max-md:h-14 max-md:flex-col max-md:gap-0.5 max-md:border-0 max-md:px-1 max-md:text-xs max-md:leading-tight max-md:whitespace-normal" : ""}`}
          >
            {IKONA[v.href] && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-5 flex-none">
                <path d={IKONA[v.href]} />
              </svg>
            )}
            {v.naziv}
          </Link>
        ))}
      </nav>
    </>
  );
}
