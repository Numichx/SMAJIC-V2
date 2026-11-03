"use client";

import { useState } from "react";
import { dugme } from "@/components/konobar/stil";
import { formatKM } from "@/lib/format";
import { useUcitaj } from "./api";
import { formatVrijeme } from "./pomocno";
import { Greska, Tabela } from "./ui";

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

function Razlika({ iznos }: { iznos: number }) {
  if (iznos === 0) return <>0,00 KM (tačno)</>;
  return <>{iznos < 0 ? `Manjak ${formatKM(-iznos)}` : `Višak ${formatKM(iznos)}`}</>;
}

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
            <p role="status" className="font-semibold">
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
              <Razlika key="r" iznos={s.razlika} />,
              s.naplate
                ? `popusti ${formatKM(s.naplate.popust)}, na dug ${formatKM(s.naplate.dug)}, kartica ${formatKM(s.naplate.kartica)}, bakšiš ${formatKM(s.naplate.baksis)}`
                : "–",
            ])}
            prazno="Još nema zatvorenih smjena."
          />
          <div className="flex gap-2">
            <button type="button" className={dugme} disabled={strana === 1} onClick={() => postaviStranu(strana - 1)}>
              Novije
            </button>
            <span className="flex items-center">Strana {strana}</span>
            <button type="button" className={dugme} disabled={!p.imaJos} onClick={() => postaviStranu(strana + 1)}>
              Starije
            </button>
          </div>
        </>
      )}
    </div>
  );
}
