"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { greskaIz } from "@/lib/api/greskaIz";
import { formatKM } from "@/lib/format";
import { CEKANJE_MS } from "@/lib/offline/sync";
import { NEMA_VEZE, PRIJAVA } from "./useMeni";

export type Sazetak = {
  id: string;
  broj: number;
  otvoren: string;
  konobar: string;
  stolovi: number[];
  bruto: number;
  popust: { procenat: number; razlog: string | null; iznos: number } | null;
  ukupno: number;
  sveIzdato: boolean;
};
type Sto = { id: number; racun: Sazetak | null };

// ja: the signed-in waiter, so their own bills stand out from colleagues' ones.
export default function StoloviPregled({ ja }: { ja: string }) {
  const [stolovi, postaviStolove] = useState<Sto[] | null>(null);
  const [greska, postaviGresku] = useState("");

  useEffect(() => {
    let zivo = true;
    async function ucitaj() {
      if (document.visibilityState !== "visible") return;
      try {
        const odgovor = await fetch("/api/stolovi", { signal: AbortSignal.timeout(CEKANJE_MS) });
        if (!zivo) return;
        if (odgovor.status === 401) return window.location.assign(PRIJAVA);
        if (!odgovor.ok) return postaviGresku(await greskaIz(odgovor));
        postaviStolove((await odgovor.json()).stolovi);
        postaviGresku("");
      } catch {
        if (zivo) postaviGresku(NEMA_VEZE);
      }
    }
    ucitaj();
    const sat = setInterval(ucitaj, 10_000);
    document.addEventListener("visibilitychange", ucitaj);
    return () => {
      zivo = false;
      clearInterval(sat);
      document.removeEventListener("visibilitychange", ucitaj);
    };
  }, []);

  // A merged bill appears on each of its tables, so count it once.
  const moji = new Map((stolovi ?? []).flatMap((s) => (s.racun && s.racun.konobar === ja ? [[s.racun.id, s.racun.ukupno] as const] : [])));
  const mojeUkupno = [...moji.values()].reduce((z, x) => z + x, 0);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <p role="alert" className="font-bold text-error">
          {greska}
        </p>
        {!stolovi && !greska && <p role="status">Učitavam stolove…</p>}
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:gap-3 xl:grid-cols-5">
          {stolovi?.map((s) => {
            const moj = s.racun?.konobar === ja;
            return (
              <li key={s.id}>
                <Link
                  href={`/konobar/stolovi/${s.id}`}
                  className={`card h-full min-h-28 items-center justify-center gap-1 border-2 bg-base-200 p-2 text-center ${moj ? "border-primary" : "border-transparent"}`}
                >
                  <span className="font-broj text-broj font-bold leading-none">
                    <span className="sr-only">Sto </span>
                    {s.id}
                  </span>
                  {!s.racun ? (
                    <Stanje boja="bg-success" tekst="Slobodan" />
                  ) : moj ? (
                    <>
                      <span className="tabelarno font-bold">{formatKM(s.racun.ukupno)}</span>
                      {!s.racun.sveIzdato && <span className="text-sm font-bold text-warning">Čeka izdavanje</span>}
                    </>
                  ) : (
                    <Stanje boja="bg-warning" tekst={s.racun.konobar} />
                  )}
                  {s.racun && s.racun.stolovi.length > 1 && <span className="text-sm text-dim">Spojeno: {s.racun.stolovi.join(", ")}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      {stolovi && (
        <aside className="flex flex-col gap-3 max-lg:order-first lg:w-72">
          <div className="card gap-1 border-2 border-primary bg-base-200 p-4 max-lg:flex-row max-lg:items-center max-lg:justify-between max-lg:p-3">
            <span className="text-dim">Moji otvoreni računi</span>
            <span className="tabelarno font-broj text-h2 font-extrabold text-primary lg:text-broj">{formatKM(mojeUkupno)}</span>
            <span className="text-sm text-dim max-lg:hidden">{moji.size === 1 ? "1 račun" : `${moji.size} računa`}</span>
          </div>
          <ul aria-label="Legenda" className="flex flex-wrap gap-x-4 gap-y-1 text-dim lg:flex-col lg:px-2">
            <li><Stanje boja="bg-success" tekst="Slobodan" /></li>
            <li><Stanje boja="bg-primary" tekst="Moj račun" /></li>
            <li><Stanje boja="bg-warning" tekst="Tuđi račun" /></li>
          </ul>
        </aside>
      )}
    </div>
  );
}

// The dot repeats the word, so the state never depends on colour alone.
function Stanje({ boja, tekst }: { boja: string; tekst: string }) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-semibold text-dim">
      <span aria-hidden="true" className={`size-2.5 flex-none rounded-full ${boja}`} />
      {tekst}
    </span>
  );
}
