"use client";

import { useEffect, useState } from "react";
import { pozovi } from "@/components/stanice/pozivi";
import { formatKM } from "@/lib/format";
import { dugme } from "./stil";

type Statistika = { dani: number; brojRacuna: number; naplaceno: number; dug: number; prosjecanRacun: number; baksis: number };
const PERIODI = [
  { dani: 1, naziv: "Danas" },
  { dani: 7, naziv: "Zadnjih 7 dana" },
  { dani: 30, naziv: "Zadnjih 30 dana" },
];

export default function StatistikaKonobara() {
  const [dani, postaviDane] = useState(1);
  const [s, postaviS] = useState<Statistika | null>(null);
  const [greska, postaviGresku] = useState("");

  useEffect(() => {
    let zivo = true;
    pozovi<{ statistika: Statistika }>(`/api/statistika-konobara?dani=${dani}`, "/login?uloga=konobar").then((r) => {
      if (!zivo) return;
      if (r.ok) {
        postaviS(r.podaci.statistika);
        postaviGresku("");
      } else postaviGresku(r.greska);
    });
    return () => {
      zivo = false;
    };
  }, [dani]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Period">
        {PERIODI.map((p) => (
          <button
            key={p.dani}
            type="button"
            aria-pressed={dani === p.dani}
            onClick={() => postaviDane(p.dani)}
            className={dugme}
          >
            {p.naziv}
          </button>
        ))}
      </div>
      <p role="alert" className="font-bold text-error">
        {greska}
      </p>
      {!s && !greska && <p role="status">Učitavam…</p>}
      {s && s.dani === dani && (
        <dl className="grid gap-3 md:grid-cols-2">
          {[
            ["Broj računa", String(s.brojRacuna)],
            ["Naplaćeno", formatKM(s.naplaceno)],
            ["Prosječan račun", formatKM(s.prosjecanRacun)],
            ["Baksiš", formatKM(s.baksis)],
            ["Na dug", formatKM(s.dug)],
          ].map(([naziv, vrijednost]) => (
            <div key={naziv} className="rounded-lg border-2 border-dim bg-base-200 p-3">
              <dt>{naziv}</dt>
              <dd className="text-2xl font-bold">{vrijednost}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
