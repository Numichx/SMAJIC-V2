"use client";

import { useState } from "react";
import { dugme, glavno, polje } from "@/components/konobar/stil";
import { formatKM } from "@/lib/format";
import { useSlanje, useUcitaj, zovi } from "./api";
import { formatDatum, formatVrijeme, jednako, prethodniDan } from "./pomocno";
import { Greska, Podaci } from "./ui";

type Izvjestaj = {
  racuni: number;
  bruto: number;
  popust: number;
  ukupno: number;
  naplaceno: number;
  gotovina: number;
  kartica: number;
  baksis: number;
  noviDug: number;
  naplaceniDugovi: { broj: number; gotovina: number; kartica: number };
  mesnica: { broj: number; iznos: number };
};
type Pregled = {
  danas: string;
  datum: string;
  zakljucak: { datum: string; vrijeme: string; zatvorila: string; izvjestaj: Izvjestaj } | null;
  pregled: Izvjestaj;
  otvoreniRacuni: number;
  otvorenaSmjena: boolean;
};

export default function ZatvaranjeDana() {
  const [datum, postaviDatum] = useState<string | null>(null);
  const { podaci: p, greska, osvjezi } = useUcitaj<Pregled>(`/api/smjene/zatvori-dan${datum ? `?datum=${datum}` : ""}`);
  const { saljem, greska: greskaSlanja, posalji } = useSlanje();
  const [gotovo, postaviGotovo] = useState("");

  async function zatvori() {
    if (!p) return;
    postaviGotovo("");
    const z = await posalji(p.datum, () => zovi("/api/smjene/zatvori-dan", "POST", { datum: p.datum }));
    if (z) {
      postaviGotovo(`Dan ${formatDatum(p.datum)} je zatvoren.`);
      osvjezi();
    }
  }

  const blokirano = p ? p.otvoreniRacuni > 0 || p.otvorenaSmjena : false;
  const promijenjeno = p?.zakljucak ? !jednako(p.zakljucak.izvjestaj, p.pregled) : false;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          Dan
          <input
            type="date"
            className={polje}
            value={datum ?? p?.datum ?? ""}
            max={p?.danas}
            onChange={(e) => e.target.value && (postaviGotovo(""), postaviDatum(e.target.value))}
          />
        </label>
        <button type="button" className={dugme} onClick={() => (postaviGotovo(""), postaviDatum(null))}>
          Danas
        </button>
        <button type="button" className={dugme} disabled={!p} onClick={() => p && (postaviGotovo(""), postaviDatum(prethodniDan(p.danas)))}>
          Jučer
        </button>
      </div>
      <Greska tekst={greska || greskaSlanja} />
      {gotovo && <p role="status" className="font-semibold">{gotovo}</p>}
      {!p && !greska && <p role="status">Učitavam…</p>}
      {p && (
        <>
          <section aria-label="Trenutni podaci dana" className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold">Dan {formatDatum(p.datum)}</h3>
            <Podaci
              stavke={[
                ["Naplaćenih računa", p.pregled.racuni],
                ["Bruto", formatKM(p.pregled.bruto)],
                ["Popusti", formatKM(p.pregled.popust)],
                ["Za naplatu", formatKM(p.pregled.ukupno)],
                ["Naplaćeno (bez računa na dug)", formatKM(p.pregled.naplaceno)],
                ["Gotovina (uključuje bakšiš)", formatKM(p.pregled.gotovina)],
                ["Kartica (uključuje bakšiš)", formatKM(p.pregled.kartica)],
                ["Bakšiš", formatKM(p.pregled.baksis)],
                ["Novi dugovi gostiju", formatKM(p.pregled.noviDug)],
                ["Prodaja mesnice", `${p.pregled.mesnica.broj}: ${formatKM(p.pregled.mesnica.iznos)}`],
              ]}
            />
            {p.pregled.racuni === 0 && <p>Tog dana nema naplaćenih računa.</p>}
          </section>

          {blokirano && (
            <section aria-label="Šta sprječava zatvaranje" className="rounded-lg border-2 border-greska p-3">
              <p className="font-semibold">Dan se ne može zatvoriti dok:</p>
              <ul className="list-disc pl-6">
                {p.otvoreniRacuni > 0 && <li>ima otvorenih računa iz tog dana: {p.otvoreniRacuni}</li>}
                {p.otvorenaSmjena && <li>je smjena otvorena (zatvara se na šanku)</li>}
              </ul>
            </section>
          )}

          {p.zakljucak && (
            <section aria-label="Zaključak" className="rounded-lg border-2 border-okvir p-3">
              <p className="font-semibold">
                Dan je zatvoren {formatVrijeme(p.zakljucak.vrijeme)} ({p.zakljucak.zatvorila}).
              </p>
              {promijenjeno ? (
                <p>
                  Od tada se nešto promijenilo, na primjer plaćanje nakon zatvaranja. Zaključak ima {p.zakljucak.izvjestaj.racuni} računa,{" "}
                  {formatKM(p.zakljucak.izvjestaj.naplaceno)} naplaćeno; sada je {p.pregled.racuni} računa, {formatKM(p.pregled.naplaceno)}.
                </p>
              ) : (
                <p>Zaključak odgovara trenutnim podacima.</p>
              )}
            </section>
          )}

          {(!p.zakljucak || promijenjeno) && (
            <div>
              <button type="button" className={glavno} aria-disabled={saljem || blokirano} onClick={() => !blokirano && zatvori()}>
                {saljem ? "Zatvaram…" : p.zakljucak ? "Zatvori ponovo" : "Zatvori dan"}
              </button>
            </div>
          )}
          <p>Plaćanje poslije ponoći ulazi u sljedeći dan. Poslije ponoći možete zatvoriti jučerašnji dan.</p>
        </>
      )}
    </div>
  );
}
