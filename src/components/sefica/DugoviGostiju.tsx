"use client";

import { useState } from "react";
import { dugme, glavno } from "@/components/konobar/stil";
import { formatKM } from "@/lib/format";
import { useSlanje, useUcitaj, zovi } from "./api";
import { formatVrijeme } from "./pomocno";
import { Greska, kartica, Strane } from "./ui";

type Dug = { racunId: string; broj: number; gostDuznik: string | null; iznos: number; vrijeme: string; stolovi: number[]; konobar: string };
type Odgovor = { dugovi: Dug[]; imaJos: boolean; broj: number; ukupno: number };
type Nacin = "gotovina" | "kartica";
const NAZIV: Record<Nacin, string> = { gotovina: "gotovinom", kartica: "karticom" };

function Red({ d, poNaplati }: { d: Dug; poNaplati: (p: string) => void }) {
  const [nacin, postaviNacin] = useState<Nacin | null>(null);
  const { saljem, greska, posalji } = useSlanje();

  async function naplati() {
    if (!nacin) return;
    const r = await posalji(`${d.racunId}|${nacin}`, (requestId) => zovi("/api/administracija/dugovi", "POST", { requestId, racunId: d.racunId, nacin }));
    // The name goes into the message as text only; the row disappears with the next reload.
    if (r) poNaplati(`Dug od ${formatKM(d.iznos)} (${d.gostDuznik ?? "bez imena"}) je naplaćen ${NAZIV[nacin]}.`);
    else postaviNacin(null);
  }

  return (
    <li className={`${kartica} gap-2`}>
      <p className="text-lg font-bold break-words">{d.gostDuznik ?? "Bez imena"}</p>
      <p>
        {formatKM(d.iznos)} · račun {d.broj} · {d.stolovi.length > 0 ? `sto ${d.stolovi.join(", ")} · ` : ""}konobar {d.konobar} · {formatVrijeme(d.vrijeme)}
      </p>
      <Greska tekst={greska} />
      {nacin ? (
        <div className="flex flex-col gap-2">
          <p className="alert alert-warning font-bold">Potvrdite naplatu {formatKM(d.iznos)} {NAZIV[nacin]}.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={glavno} aria-disabled={saljem} aria-label={`Potvrdi naplatu ${NAZIV[nacin]}, račun ${d.broj}`} onClick={naplati}>
              {saljem ? "Naplaćujem…" : "Potvrdi naplatu"}
            </button>
            <button type="button" className={dugme} onClick={() => postaviNacin(null)}>
              Odustani
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={dugme} aria-label={`Naplati gotovinom, račun ${d.broj}`} onClick={() => postaviNacin("gotovina")}>
            Naplati gotovinom
          </button>
          <button type="button" className={dugme} aria-label={`Naplati karticom, račun ${d.broj}`} onClick={() => postaviNacin("kartica")}>
            Naplati karticom
          </button>
        </div>
      )}
    </li>
  );
}

export default function DugoviGostiju() {
  const [strana, postaviStranu] = useState(1);
  const [poruka, postaviPoruku] = useState("");
  const { podaci: p, greska, osvjezi, ucitano } = useUcitaj<Odgovor>(`/api/administracija/dugovi?strana=${strana}`);

  return (
    <div className="flex flex-col gap-4">
      <Greska tekst={greska} />
      {poruka && <p role="status" className="font-bold break-words">{poruka}</p>}
      {!ucitano && !greska && <p role="status">Učitavam dugove…</p>}
      {p && (
        <>
          <p className="text-lg font-bold">
            Neplaćenih dugova: {p.broj}, ukupno {formatKM(p.ukupno)}
          </p>
          <p>Dug se naplaćuje cijeli, u iznosu s računa, bez bakšiša.</p>
          {p.dugovi.length === 0 && <p>Nema neplaćenih dugova gostiju.</p>}
          <ul className="flex flex-col gap-2">
            {p.dugovi.map((d) => (
              <Red
                key={d.racunId}
                d={d}
                poNaplati={(m) => {
                  postaviPoruku(m);
                  osvjezi();
                }}
              />
            ))}
          </ul>
          <Strane strana={strana} prethodna={strana > 1 ? () => postaviStranu(strana - 1) : undefined} sljedeca={p.imaJos ? () => postaviStranu(strana + 1) : undefined} />
        </>
      )}
    </div>
  );
}
