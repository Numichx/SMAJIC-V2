"use client";

import Link from "next/link";
import { useState } from "react";
import { dugme, glavno } from "@/components/konobar/stil";
import { pregledPopisa } from "@/lib/domain/pecenjara";
import { formatBroj, formatKM } from "@/lib/format";
import { useSlanje, useUcitaj, zovi } from "./api";
import { formatVrijeme, kolicinaIzUnosa } from "./pomocno";
import { Greska, Podaci, Polje, Tabela } from "./ui";

type Popis = {
  smjenaId: string;
  otvoreno: string;
  pocetneKokePecene: number;
  pocetneKokeSirove: number;
  pocetnaJanjetinaKg: number;
  zatvoreno: string | null;
  dodatneKoke: number | null;
  dodatnaJanjetinaKg: number | null;
  preostaleKoke: number | null;
  preostalaJanjetinaKg: number | null;
  prodaneKoke: number | null;
  prodanaJanjetinaKg: number | null;
  cijenaKoke: number | null;
  cijenaJanjetine: number | null;
  pazarPoPopisu: number | null;
  predaniPazar: number | null;
  razlika: number | null;
};
type Pregled = {
  smjena: { id: string; oznaka: string; pocetak: string } | null;
  popis: Popis | null;
  cijene: { koka: number | null; janjetina: number | null };
  historija: Popis[];
  imaJos: boolean;
};
type Dugovi = { dugovi: { konobarId: string; ime: string; izdato: number; placeno: number; dug: number }[]; ukupno: number };

function Otvaranje({ osvjezi }: { osvjezi: () => void }) {
  const [pecene, postaviPecene] = useState("");
  const [sirove, postaviSirove] = useState("");
  const [kg, postaviKg] = useState("");
  const [lokalno, postaviLokalno] = useState("");
  const { saljem, greska, posalji } = useSlanje();

  async function otvori() {
    const a = kolicinaIzUnosa(pecene, 0);
    const b = kolicinaIzUnosa(sirove, 0);
    const c = kolicinaIzUnosa(kg, 3);
    if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c)) return postaviLokalno("Unesite broj pečenih i sirovih pilića (cijeli brojevi) i jagnjetinu u kg (do tri decimale). Za nulu upišite 0.");
    postaviLokalno("");
    const r = await posalji(`${a}|${b}|${c}`, (requestId) =>
      zovi("/api/pecenjara/smjena", "POST", { requestId, pocetneKokePecene: a, pocetneKokeSirove: b, pocetnaJanjetinaKg: c }),
    );
    if (r) osvjezi();
  }

  return (
    <section aria-label="Početni popis" className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">Početni popis pečenjare</h3>
      <Polje oznaka="Pečenih pilića" vrijednost={pecene} onChange={postaviPecene} tip="numeric" />
      <Polje oznaka="Sirovih pilića" vrijednost={sirove} onChange={postaviSirove} tip="numeric" />
      <Polje oznaka="Jagnjetina (kg)" vrijednost={kg} onChange={postaviKg} />
      <Greska tekst={lokalno || greska} />
      <div>
        <button type="button" className={glavno} aria-disabled={saljem} onClick={otvori}>
          {saljem ? "Spremam…" : "Spremi početni popis"}
        </button>
      </div>
    </section>
  );
}

function Zatvaranje({ popis, cijene, osvjezi }: { popis: Popis; cijene: Pregled["cijene"]; osvjezi: () => void }) {
  const [dodatne, postaviDodatne] = useState("");
  const [dodatnoKg, postaviDodatnoKg] = useState("");
  const [preostale, postaviPreostale] = useState("");
  const [preostaloKg, postaviPreostaloKg] = useState("");
  const [predani, postaviPredani] = useState("");
  const [potvrda, postaviPotvrdu] = useState(false);
  const [lokalno, postaviLokalno] = useState("");
  const { saljem, greska, posalji } = useSlanje();

  const v = {
    dodatneKoke: kolicinaIzUnosa(dodatne, 0),
    dodatnaJanjetinaKg: kolicinaIzUnosa(dodatnoKg, 3),
    preostaleKoke: kolicinaIzUnosa(preostale, 0),
    preostalaJanjetinaKg: kolicinaIzUnosa(preostaloKg, 3),
    predaniPazar: kolicinaIzUnosa(predani, 2),
  };
  const ispravno = Object.values(v).every((x) => !Number.isNaN(x));
  const pregled =
    ispravno && cijene.koka !== null && cijene.janjetina !== null
      ? pregledPopisa({ ...popis, ...v, cijenaKoke: cijene.koka, cijenaJanjetine: cijene.janjetina })
      : null;
  const prekoRaspolozivog =
    ispravno &&
    (v.preostaleKoke > popis.pocetneKokePecene + popis.pocetneKokeSirove + v.dodatneKoke ||
      v.preostalaJanjetinaKg > popis.pocetnaJanjetinaKg + v.dodatnaJanjetinaKg);

  // A closed count cannot be corrected, so the first tap only shows the result.
  function provjeri() {
    if (!ispravno) return postaviLokalno("Popunite sva polja. Pilići su cijeli brojevi, jagnjetina ima do tri decimale, pazar do dvije. Za nulu upišite 0.");
    if (prekoRaspolozivog) return postaviLokalno("Završno stanje ne može biti veće od početnog stanja i dodatnih količina.");
    if (!pregled) return postaviLokalno("U meniju nedostaje cijena pečenog pileta ili jagnjetine.");
    if (!pregled.moguce) return postaviLokalno("Završno stanje je veće od raspoloživog, pa je prodaja negativna.");
    postaviLokalno("");
    postaviPotvrdu(true);
  }

  async function zatvori() {
    if (!ispravno) return;
    const r = await posalji(JSON.stringify(v), (requestId) => zovi("/api/pecenjara/smjena", "PATCH", { requestId, smjenaId: popis.smjenaId, ...v }));
    if (r) osvjezi();
    else postaviPotvrdu(false);
  }

  return (
    <section aria-label="Završni popis" className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">Završni popis pečenjare</h3>
      <p>
        Početno stanje: {popis.pocetneKokePecene} pečenih, {popis.pocetneKokeSirove} sirovih, {formatBroj(popis.pocetnaJanjetinaKg)} kg jagnjetine.
      </p>
      <Polje oznaka="Dodatno pilića tokom smjene" vrijednost={dodatne} onChange={postaviDodatne} tip="numeric" />
      <Polje oznaka="Dodatna jagnjetina (kg)" vrijednost={dodatnoKg} onChange={postaviDodatnoKg} />
      <Polje oznaka="Preostalo pilića" vrijednost={preostale} onChange={postaviPreostale} tip="numeric" />
      <Polje oznaka="Preostala jagnjetina (kg)" vrijednost={preostaloKg} onChange={postaviPreostaloKg} />
      <Polje oznaka="Predani pazar (KM)" vrijednost={predani} onChange={postaviPredani} />
      {pregled?.moguce && !prekoRaspolozivog && (
        <section aria-label="Pregled popisa" className="rounded-lg border-2 border-okvir p-3">
          <Podaci
            stavke={[
              ["Prodano pilića", pregled.prodaneKoke],
              ["Prodana jagnjetina", `${formatBroj(pregled.prodanaJanjetinaKg)} kg`],
              ["Pazar po popisu", formatKM(pregled.pazarPoPopisu)],
              ["Predano", formatKM(v.predaniPazar)],
              ["Razlika", pregled.razlika === 0 ? "0,00 KM (tačno)" : pregled.razlika < 0 ? `Manjak ${formatKM(-pregled.razlika)}` : `Višak ${formatKM(pregled.razlika)}`],
            ]}
          />
          <p>Pregled je samo procjena; server računa konačne iznose.</p>
        </section>
      )}
      <Greska tekst={lokalno || greska} />
      {potvrda ? (
        <div className="flex flex-col gap-2">
          <p className="font-semibold">Zaključani popis se ne može ispraviti. Jeste li sigurni?</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={glavno} aria-disabled={saljem} onClick={zatvori}>
              {saljem ? "Zaključujem…" : "Da, zaključi popis"}
            </button>
            <button type="button" className={dugme} onClick={() => postaviPotvrdu(false)}>
              Nazad
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button type="button" className={glavno} onClick={provjeri}>
            Pregledaj i zaključi
          </button>
        </div>
      )}
    </section>
  );
}

function Dugovi() {
  const { podaci: d, greska, ucitano } = useUcitaj<Dugovi>("/api/pecenjara/dug");
  return (
    <section aria-label="Dugovi konobara pečenjari" className="flex flex-col gap-2">
      <h3 className="text-lg font-semibold">Dugovi konobara pečenjari</h3>
      <p>Samo za pregled: uplate bilježi pečenjara.</p>
      <Greska tekst={greska} />
      {!ucitano && !greska && <p role="status">Učitavam dugove…</p>}
      {d && (
        <>
          <Tabela
            naslov="Ko duguje pečenjari"
            kolone={["Konobar", "Izdato", "Uplaćeno", "Dug"]}
            redovi={d.dugovi.map((x) => [x.ime, formatKM(x.izdato), formatKM(x.placeno), formatKM(x.dug)])}
            prazno="Nijedan konobar ne duguje pečenjari."
          />
          {d.dugovi.length > 0 && <p className="font-semibold">Ukupno: {formatKM(d.ukupno)}</p>}
        </>
      )}
    </section>
  );
}

export default function PopisPecenjare() {
  const [strana, postaviStranu] = useState(1);
  const { podaci: p, greska, osvjezi, ucitano } = useUcitaj<Pregled>(`/api/pecenjara/smjena?strana=${strana}`);

  return (
    <div className="flex flex-col gap-6">
      <p>Popis radi šefica samo kad pečenjare nema. Pečenjara inače radi svoj popis na svom ekranu.</p>
      <Greska tekst={greska} />
      {!ucitano && !greska && <p role="status">Učitavam…</p>}
      {p && (
        <>
          {!p.smjena && (
            <p role="status">
              Nema otvorene smjene. Smjenu otvara konobar ili šefica na <Link href="/sank" className="inline-flex min-h-12 min-w-12 items-center justify-center underline">šanku</Link>.
            </p>
          )}
          {p.smjena && (
            <p>
              Smjena {p.smjena.oznaka} od {formatVrijeme(p.smjena.pocetak)}.
            </p>
          )}
          {p.smjena && !p.popis && <Otvaranje osvjezi={osvjezi} />}
          {p.popis && !p.popis.zatvoreno && <Zatvaranje popis={p.popis} cijene={p.cijene} osvjezi={osvjezi} />}
          {p.popis?.zatvoreno && (
            <p role="status" className="font-semibold">
              Popis pečenjare za ovu smjenu je zaključen.
            </p>
          )}
          <Tabela
            naslov="Zaključeni popisi"
            kolone={["Otvoren", "Prodano pilića", "Prodana jagnjetina", "Pazar po popisu", "Predano", "Razlika"]}
            redovi={p.historija.map((h) => [
              formatVrijeme(h.otvoreno),
              h.prodaneKoke ?? "–",
              h.prodanaJanjetinaKg === null ? "–" : `${formatBroj(h.prodanaJanjetinaKg)} kg`,
              h.pazarPoPopisu === null ? "–" : formatKM(h.pazarPoPopisu),
              h.predaniPazar === null ? "–" : formatKM(h.predaniPazar),
              h.razlika === null ? "–" : formatKM(h.razlika),
            ])}
            prazno="Još nema zaključenih popisa."
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
      <Dugovi />
    </div>
  );
}
