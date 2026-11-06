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
      <p role="alert" className="font-semibold text-greska">
        {greska}
      </p>
      {!stolovi && !greska && <p role="status">Učitavam stolove…</p>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {stolovi?.map((s) => (
          <li key={s.id}>
            <Link
              href={`/konobar/stolovi/${s.id}`}
              className={`flex min-h-28 flex-col justify-center gap-1 rounded-lg border-2 p-3 ${s.racun ? "border-akcent bg-povrsina" : "border-okvir"}`}
            >
              <span className="text-xl font-bold">Sto {s.id}</span>
              {s.racun ? (
                <>
                  <span className="text-lg font-semibold">{formatKM(s.racun.ukupno)}</span>
                  <span>{s.racun.konobar}</span>
                  {s.racun.stolovi.length > 1 && <span>Spojeno: {s.racun.stolovi.join(", ")}</span>}
                </>
              ) : (
                <span>Slobodan</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
