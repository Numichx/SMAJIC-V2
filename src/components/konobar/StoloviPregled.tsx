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

export default function StoloviPregled() {
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

  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="font-bold text-error">
        {greska}
      </p>
      {!stolovi && !greska && <p role="status">Učitavam stolove…</p>}
      <ul className="grid grid-cols-3 gap-2 md:grid-cols-4 md:gap-3 xl:grid-cols-5">
        {stolovi?.map((s) => (
          <li key={s.id}>
            <Link
              href={`/konobar/stolovi/${s.id}`}
              className={`card h-full min-h-32 gap-1 border-2 p-2 md:p-3 ${
                !s.racun ? "border-dashed border-dim" : s.racun.sveIzdato ? "border-transparent bg-base-200" : "border-warning bg-base-200"
              }`}
            >
              <span>
                <span className="text-dim">Sto </span>
                <span className="font-broj text-broj font-extrabold md:text-broj-xl">{s.id}</span>
              </span>
              {s.racun ? (
                <>
                  <span className="font-bold tabular-nums">{formatKM(s.racun.ukupno)}</span>
                  <span>{s.racun.konobar}</span>
                  {s.racun.stolovi.length > 1 && <span>Spojeno: {s.racun.stolovi.join(", ")}</span>}
                  <span className={s.racun.sveIzdato ? "text-dim" : "font-bold text-warning"}>{s.racun.sveIzdato ? "Otvoren" : "Čeka izdavanje"}</span>
                </>
              ) : (
                <span className="text-dim">Slobodan</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
