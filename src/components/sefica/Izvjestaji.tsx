"use client";

import { useState } from "react";
import { dugme } from "@/components/konobar/stil";
import { formatBroj, formatKM } from "@/lib/format";
import { useUcitaj } from "./api";
import { formatDatum } from "./pomocno";
import { Greska, Podaci, Tabela } from "./ui";

type Izvjestaj = {
  od: string;
  do: string;
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
  poNacinu: { nacin: string; broj: number; ukupno: number; baksis: number }[];
  popusti: { razlog: string | null; broj: number; iznos: number }[];
  storna: { razlog: string; broj: number; vrijednost: number }[];
  poKonobaru: { ime: string; racuni: number; naplaceno: number; dug: number; popust: number; baksis: number }[];
  poProizvodu: { naziv: string; jedinica: string; kolicina: number; iznos: number }[];
  poDanu: { datum: string; racuni: number; bruto: number; popust: number; ukupno: number; baksis: number }[];
  mesnica: { broj: number; iznos: number };
  otvoreniRacuni: number;
  otvoreniDugovi: { broj: number; ukupno: number };
};

const PERIODI = [
  { dani: 1, naziv: "Danas" },
  { dani: 7, naziv: "7 dana" },
  { dani: 30, naziv: "30 dana" },
];

const NACIN: Record<string, string> = { gotovina: "Gotovina", kartica: "Kartica", kombinovano: "Gotovina i kartica", dug: "Na dug" };

export default function Izvjestaji() {
  const [dani, postaviDane] = useState(1);
  const { podaci: i, greska, ucitano } = useUcitaj<{ izvjestaj: Izvjestaj }>(`/api/izvjestaji?dani=${dani}`);
  const r = i?.izvjestaj;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODI.map((p) => (
          <button
            key={p.dani}
            type="button"
            aria-pressed={dani === p.dani}
            onClick={() => postaviDane(p.dani)}
            className={`${dugme} aria-pressed:border-akcent aria-pressed:bg-akcent aria-pressed:text-akcent-tekst`}
          >
            {p.naziv}
          </button>
        ))}
        <a href={`/api/izvjestaji/csv?dani=${dani}`} download className={`${dugme} flex items-center`}>
          Preuzmi CSV
        </a>
      </div>
      <Greska tekst={greska} />
      {!ucitano && !greska && <p role="status">Učitavam izvještaj…</p>}
      {r && (
        <>
          <p>
            Period: {formatDatum(r.od)} – {formatDatum(r.do)} Račun se računa na dan kad je plaćen.
          </p>
          {r.racuni === 0 && r.mesnica.broj === 0 && <p>U ovom periodu nema naplaćenih računa.</p>}
          <section aria-label="Sažetak" className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold">Sažetak</h3>
            <Podaci
              stavke={[
                ["Naplaćenih računa", r.racuni],
                ["Bruto", formatKM(r.bruto)],
                ["Popusti", formatKM(r.popust)],
                ["Za naplatu (poslije popusta)", formatKM(r.ukupno)],
                ["Naplaćeno (bez računa na dug)", formatKM(r.naplaceno)],
                ["Gotovina zadržana (uključuje bakšiš)", formatKM(r.gotovina)],
                ["Kartica naplaćena (uključuje bakšiš)", formatKM(r.kartica)],
                ["Bakšiš", formatKM(r.baksis)],
                ["Novi dugovi gostiju", formatKM(r.noviDug)],
                [
                  "Naplaćeni dugovi",
                  `${r.naplaceniDugovi.broj}: gotovina ${formatKM(r.naplaceniDugovi.gotovina)}, kartica ${formatKM(r.naplaceniDugovi.kartica)}`,
                ],
                ["Prodaja mesnice", `${r.mesnica.broj}: ${formatKM(r.mesnica.iznos)}`],
                ["Trenutno otvorenih računa", r.otvoreniRacuni],
                ["Trenutno neplaćenih dugova", `${r.otvoreniDugovi.broj}: ${formatKM(r.otvoreniDugovi.ukupno)}`],
              ]}
            />
            <p>Gotovina i kartica sadrže bakšiš, pa ne odgovaraju zbiru „Za naplatu“.</p>
          </section>
          <Tabela
            naslov="Načini plaćanja"
            kolone={["Način", "Računa", "Iznos", "Bakšiš"]}
            redovi={r.poNacinu.map((x) => [NACIN[x.nacin] ?? x.nacin, x.broj, formatKM(x.ukupno), formatKM(x.baksis)])}
            prazno="Nema naplata."
          />
          <Tabela
            naslov="Popusti"
            kolone={["Razlog", "Računa", "Iznos"]}
            redovi={r.popusti.map((x) => [x.razlog ?? "Bez razloga", x.broj, formatKM(x.iznos)])}
            prazno="Nije bilo popusta."
          />
          <Tabela
            naslov="Storna"
            kolone={["Razlog", "Stavki", "Vrijednost"]}
            redovi={r.storna.map((x) => [x.razlog, x.broj, formatKM(x.vrijednost)])}
            prazno="Nije bilo storna."
          />
          <Tabela
            naslov="Po konobaru"
            kolone={["Konobar", "Računa", "Naplaćeno", "Na dug", "Popust", "Bakšiš"]}
            redovi={r.poKonobaru.map((x) => [x.ime, x.racuni, formatKM(x.naplaceno), formatKM(x.dug), formatKM(x.popust), formatKM(x.baksis)])}
            prazno="Nema naplata."
          />
          <Tabela
            naslov="Po proizvodu"
            kolone={["Proizvod", "Količina", "Iznos (prije popusta)"]}
            redovi={r.poProizvodu.map((x) => [x.naziv, `${formatBroj(x.kolicina)} ${x.jedinica}`, formatKM(x.iznos)])}
            prazno="Nema prodatih proizvoda."
          />
          <Tabela
            naslov="Po danu"
            kolone={["Dan", "Računa", "Bruto", "Popust", "Za naplatu", "Bakšiš"]}
            redovi={r.poDanu.map((x) => [formatDatum(x.datum), x.racuni, formatKM(x.bruto), formatKM(x.popust), formatKM(x.ukupno), formatKM(x.baksis)])}
            prazno="Nema naplata."
          />
        </>
      )}
    </div>
  );
}
