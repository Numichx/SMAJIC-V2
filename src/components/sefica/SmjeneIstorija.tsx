"use client";

import { useState } from "react";
import { formatKM } from "@/lib/format";
import { useUcitaj } from "./api";
import { formatVrijeme, razlikaTekst } from "./pomocno";
import { Greska, Strane, Tabela } from "./ui";

type Smjena = {
  id: string;
  oznaka: string;
  pocetak: string;
  otvorio: string;
  kraj: string;
  zatvorio: string;
  pazarSanka: number;
  pazarStanica: number;
  ocekivaniPazar: number;
  predaniPazar: number;
  razlika: number;
  naplate: { naplaceno: number; gotovina: number; kartica: number; baksis: number; popust: number; dug: number } | null;
};
type Odgovor = { otvorena: { oznaka: string; pocetak: string; otvorio: string } | null; smjene: Smjena[]; imaJos: boolean };

export default function SmjeneIstorija() {
  const [strana, postaviStranu] = useState(1);
  const { podaci: p, greska, ucitano } = useUcitaj<Odgovor>(`/api/smjene?strana=${strana}`);

  return (
    <div className="flex flex-col gap-4">
      <Greska tekst={greska} />
      {!ucitano && !greska && <p role="status">Učitavam smjene…</p>}
      {p && (
        <>
          {p.otvorena ? (
            <p role="status" className="font-bold">
              Otvorena je smjena {p.otvorena.oznaka} od {formatVrijeme(p.otvorena.pocetak)} ({p.otvorena.otvorio}).
            </p>
          ) : (
            <p>Nijedna smjena nije otvorena.</p>
          )}
          <p>
            Razlika je predani pazar minus očekivani pazar (šank po popisu plus kuhinja i pečenjara po cijenama iz menija). Popusti, računi na dug
            i plaćanja karticom se ne oduzimaju, pa se u razlici pojavljuju kao manjak. Pogledajte ih u koloni „Plaćanja u smjeni“.
          </p>
          <Tabela
            naslov="Zatvorene smjene"
            kolone={["Smjena", "Trajanje", "Pazar šanka", "Pazar stanica", "Očekivano", "Predano", "Razlika", "Plaćanja u smjeni"]}
            redovi={p.smjene.map((s) => [
              s.oznaka,
              `${formatVrijeme(s.pocetak)} – ${formatVrijeme(s.kraj)} (${s.otvorio} / ${s.zatvorio})`,
              formatKM(s.pazarSanka),
              formatKM(s.pazarStanica),
              formatKM(s.ocekivaniPazar),
              formatKM(s.predaniPazar),
              razlikaTekst(s.razlika),
              s.naplate
                ? `popusti ${formatKM(s.naplate.popust)}, na dug ${formatKM(s.naplate.dug)}, kartica ${formatKM(s.naplate.kartica)}, bakšiš ${formatKM(s.naplate.baksis)}`
                : "–",
            ])}
            prazno="Još nema zatvorenih smjena."
            tekstKolone={[0, 1, 7]}
          />
          <Strane strana={strana} prethodna={strana > 1 ? () => postaviStranu(strana - 1) : undefined} sljedeca={p.imaJos ? () => postaviStranu(strana + 1) : undefined} />
        </>
      )}
    </div>
  );
}
