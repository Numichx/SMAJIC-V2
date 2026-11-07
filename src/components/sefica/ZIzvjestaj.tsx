"use client";

import { useState } from "react";
import { dugme, polje } from "@/components/konobar/stil";
import { formatKM } from "@/lib/format";
import { useUcitaj } from "./api";
import { formatDatum, formatVrijeme, prethodniDan } from "./pomocno";
import { danasUSarajevu } from "./zIzvjestajPomocno";
import { Greska, kartica, Podaci, Tabela } from "./ui";

type Izvjestaj = {
  datum: string;
  zatvoren: boolean;
  zatvorenoU: string | null;
  zatvorila: string | null;
  promijenjenoNakonZatvaranja: boolean;
  pdv: null;
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
  storna: { razlog: string; broj: number; vrijednost: number }[];
  popusti: { razlog: string; broj: number; iznos: number }[];
};

const NACIN: Record<string, string> = {
  gotovina: "Gotovina",
  kartica: "Kartica",
  kombinovano: "Gotovina i kartica",
  dug: "Na dug",
};

export default function ZIzvjestaj({ danas }: { danas: string }) {
  const [izabraniDatum, postaviDatum] = useState(danas);
  const url = `/api/izvjestaji/z?datum=${izabraniDatum}`;
  const { podaci, greska } = useUcitaj<{ izvjestaj: Izvjestaj }>(url);
  const izvjestaj = podaci?.izvjestaj;
  const izvjestajZaDatum = izvjestaj?.datum === izabraniDatum ? izvjestaj : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          Dan
          <input
            type="date"
            className={polje}
            value={izabraniDatum}
            onChange={(e) => postaviDatum(e.target.value || danasUSarajevu())}
          />
        </label>
        <button type="button" className={dugme} onClick={() => postaviDatum(danasUSarajevu())}>Danas</button>
        {izvjestajZaDatum && (
          <button type="button" className={dugme} onClick={() => postaviDatum(prethodniDan(izvjestajZaDatum.datum))}>Jučer</button>
        )}
      </div>
      <Greska tekst={greska} />
      {!izvjestajZaDatum && !greska && <p role="status">Učitavam Z-izvještaj…</p>}
      {izvjestajZaDatum && (
        <>
          <section aria-label="Status Z-izvještaja" className={`${kartica} gap-2`}>
            <h2 className="text-xl font-bold">Z-izvještaj za {formatDatum(izvjestajZaDatum.datum)}</h2>
            {izvjestajZaDatum.zatvoren ? (
              <>
                <p>
                  Dan je zatvoren{izvjestajZaDatum.zatvorenoU ? ` ${formatVrijeme(izvjestajZaDatum.zatvorenoU)}` : ""}
                  {izvjestajZaDatum.zatvorila ? ` (${izvjestajZaDatum.zatvorila})` : ""}. Prikazan je spremljeni zaključak.
                </p>
                {izvjestajZaDatum.promijenjenoNakonZatvaranja && (
                  <p role="status" className="font-bold">Podaci su se promijenili nakon zatvaranja. Za ažuriran zaključak koristite „Zatvaranje dana“.</p>
                )}
              </>
            ) : <p>Dan još nije zatvoren. Prikazani su trenutno evidentirani podaci.</p>}
          </section>
          <section aria-label="Sažetak Z-izvještaja" className="flex flex-col gap-2">
            <h3 className="text-lg font-bold">Sažetak</h3>
            <Podaci stavke={[
              ["Računi", izvjestajZaDatum.racuni],
              ["Bruto", formatKM(izvjestajZaDatum.bruto)],
              ["Popusti", formatKM(izvjestajZaDatum.popust)],
              ["Za naplatu poslije popusta", formatKM(izvjestajZaDatum.ukupno)],
              ["Naplaćeno (bez novih dugova)", formatKM(izvjestajZaDatum.naplaceno)],
              ["Gotovina (uključuje bakšiš)", formatKM(izvjestajZaDatum.gotovina)],
              ["Kartica (uključuje bakšiš)", formatKM(izvjestajZaDatum.kartica)],
              ["Bakšiš", formatKM(izvjestajZaDatum.baksis)],
              ["Novi dugovi gostiju", formatKM(izvjestajZaDatum.noviDug)],
              ["Naplaćeni stari dugovi", `${izvjestajZaDatum.naplaceniDugovi.broj}: gotovina ${formatKM(izvjestajZaDatum.naplaceniDugovi.gotovina)}, kartica ${formatKM(izvjestajZaDatum.naplaceniDugovi.kartica)}`],
            ]} />
            <p>Gotovina i kartica uključuju bakšiš. PDV nije podešen; ovaj izvještaj nije fiskalni račun.</p>
          </section>
          <Tabela
            naslov="Načini plaćanja"
            kolone={["Način", "Računa", "Iznos", "Bakšiš"]}
            redovi={izvjestajZaDatum.poNacinu.map((x) => [NACIN[x.nacin] ?? x.nacin, x.broj, formatKM(x.ukupno), formatKM(x.baksis)])}
            prazno="Nema naplata."
          />
          <Tabela
            naslov="Popusti"
            kolone={["Razlog", "Računa", "Iznos"]}
            redovi={izvjestajZaDatum.popusti.map((x) => [x.razlog ?? "Bez razloga", x.broj, formatKM(x.iznos)])}
            prazno="Nije bilo popusta."
          />
          <Tabela
            naslov="Storna"
            kolone={["Razlog", "Stavki", "Vrijednost"]}
            redovi={izvjestajZaDatum.storna.map((x) => [x.razlog, x.broj, formatKM(x.vrijednost)])}
            prazno="Nije bilo storna."
          />
        </>
      )}
    </div>
  );
}
