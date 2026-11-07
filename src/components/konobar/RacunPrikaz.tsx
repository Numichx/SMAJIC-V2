"use client";

import { dugme } from "./stil";
import { useState } from "react";
import { RAZLOZI_STORNA } from "@/lib/domain/naplata";
import { formatBroj, formatKM, NAZIV_STANICE } from "@/lib/format";
import type { Sazetak } from "./StoloviPregled";

export type Racun = Sazetak & {
  narudzbe: {
    id: string;
    stanica: string;
    status: "Novo" | "U pripremi" | "Gotovo" | "Izdato";
    kreirano: string;
    stavke: {
      id: number;
      naziv: string;
      jedinica: string;
      kolicina: number;
      cijena: number;
      iznos: number;
      napomena: string | null;
      prilogUz: number | null;
      poseban: boolean;
      stornoRazlog: string | null;
      stornoVrijednost: number | null;
    }[];
  }[];
};

type StavkaRacuna = Racun["narudzbe"][number]["stavke"][number];

export default function RacunPrikaz({ racun, onStorno }: { racun: Racun; onStorno: (stavkaId: number, razlog: string) => Promise<void> }) {
  const sve = racun.narudzbe.flatMap((n) => n.stavke);
  const [izabrana, postaviIzabranu] = useState<number | null>(null);

  // One line: name and amount, a voided line stays with its original value, and the reasons open under the Storno button.
  function Linija({ s, prilog, uz }: { s: StavkaRacuna; prilog?: boolean; uz?: string }) {
    const storno = s.stornoRazlog !== null;
    const naziv = prilog
      ? `+ ${s.naziv}${uz ? ` uz ${uz}` : ""}${s.poseban ? " (poseban)" : ""}`
      : `${formatBroj(s.kolicina)} ${s.jedinica} ${s.naziv}`;
    return (
      <div className={prilog ? "pl-4" : ""}>
        <div className="flex items-center justify-between gap-2">
          <span className={storno ? "line-through" : ""}>{naziv}</span>
          <span className={storno ? "line-through" : ""}>{storno ? formatKM(s.stornoVrijednost ?? 0) : prilog && s.cijena === 0 ? "uključeno" : formatKM(s.iznos)}</span>
        </div>
        {storno && <p className="font-bold">Stornirano: {s.stornoRazlog}</p>}
        {!storno && (
          <button
            type="button"
            className="min-h-12 rounded-lg border-2 border-okvir px-3"
            aria-label={`Storno ${s.naziv}`}
            aria-expanded={izabrana === s.id}
            onClick={() => postaviIzabranu(izabrana === s.id ? null : s.id)}
          >
            Storno
          </button>
        )}
        {izabrana === s.id && (
          <div role="group" aria-label={`Razlog storna za ${s.naziv}`} className="mt-1 flex flex-wrap gap-2">
            {RAZLOZI_STORNA.map((r) => (
              <button
                key={r}
                type="button"
                className={dugme}
                onClick={async () => {
                  await onStorno(s.id, r);
                  postaviIzabranu(null);
                }}
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <section aria-label="Otvoreni račun" className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">
        Račun {racun.broj} · {racun.konobar}
      </h2>
      {racun.narudzbe.map((n) => (
        <div key={n.id} className="rounded-lg border-2 border-okvir p-3">
          <p className="font-bold">
            {NAZIV_STANICE[n.stanica] ?? n.stanica} · {n.status}
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {n.stavke
              .filter((s) => s.prilogUz === null)
              .map((s) => (
                <li key={s.id}>
                  {Linija({ s })}
                  {s.napomena && <p className="pl-4 italic">{s.napomena}</p>}
                  {n.stavke
                    .filter((p) => p.prilogUz === s.id)
                    .map((p) => (
                      <div key={p.id}>{Linija({ s: p, prilog: true })}</div>
                    ))}
                </li>
              ))}
            {/* A grill dish's fries come from the kitchen, so the side sits on another station's order. */}
            {n.stavke
              .filter((p) => p.prilogUz !== null && !n.stavke.some((s) => s.id === p.prilogUz))
              .map((p) => (
                <li key={p.id}>{Linija({ s: p, prilog: true, uz: sve.find((s) => s.id === p.prilogUz)?.naziv })}</li>
              ))}
          </ul>
        </div>
      ))}
      {racun.popust && (
        <>
          <p>Ukupno bez popusta: {formatKM(racun.bruto)}</p>
          <p>
            Popust {formatBroj(racun.popust.procenat)} %{racun.popust.razlog && ` (${racun.popust.razlog})`}: −{formatKM(racun.popust.iznos)}
          </p>
        </>
      )}
      <p className="text-xl font-bold">Ukupno: {formatKM(racun.ukupno)}</p>
    </section>
  );
}
