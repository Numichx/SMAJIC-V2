"use client";

import { useState } from "react";
import { useUcitaj } from "./api";
import { detaljiTekst, formatVrijeme, nazivRadnje } from "./pomocno";
import { Greska, kartica, Strane } from "./ui";

type Zapis = { id: number; vrijeme: string; zaposlenik: string | null; radnja: string; detalji: unknown };

export default function Dnevnik() {
  // Each page starts after the last id of the one before; the stack lets "Prethodna" go back.
  const [kursori, postaviKursore] = useState<number[]>([]);
  const prije = kursori.at(-1);
  const { podaci: p, greska, ucitano } = useUcitaj<{ dnevnik: Zapis[]; sljedeci: number | null }>(`/api/administracija/dnevnik${prije ? `?prije=${prije}` : ""}`);

  return (
    <div className="flex flex-col gap-4">
      <p>Dnevnik bilježi osjetljive radnje: popuste, storna, naplate dugova, zatvaranje dana, promjene osoblja i zalihe.</p>
      <Greska tekst={greska} />
      {!ucitano && !greska && <p role="status">Učitavam dnevnik…</p>}
      {p && p.dnevnik.length === 0 && <p>Dnevnik je prazan.</p>}
      <ul className="flex flex-col gap-2">
        {p?.dnevnik.map((z) => (
          <li key={z.id} className={`${kartica} gap-1`}>
            <p className="font-bold break-words">
              {nazivRadnje(z.radnja)} · {z.zaposlenik ?? "nepoznato"}
            </p>
            <p>{formatVrijeme(z.vrijeme)}</p>
            <ul className="mt-1 text-base break-all">
              {detaljiTekst(z.detalji).map((red, i) => (
                <li key={i}>{red}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {p && (
        <Strane
          strana={kursori.length + 1}
          prethodna={kursori.length > 0 ? () => postaviKursore(kursori.slice(0, -1)) : undefined}
          sljedeca={p.sljedeci !== null ? () => p.sljedeci !== null && postaviKursore([...kursori, p.sljedeci]) : undefined}
        />
      )}
    </div>
  );
}
