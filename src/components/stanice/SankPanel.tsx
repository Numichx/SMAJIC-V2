"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatBroj, formatKM } from "@/lib/format";
import { dugme, glavno, polje } from "@/components/konobar/stil";
import { idPokusaja, pozovi, useLista } from "./pozivi";
import { kolicinaIzUnosa, novacIzUnosa, razlikaTekst } from "./brojevi";
import { vrijemeSarajevo } from "./vrijeme";

const PRIJAVA = "/login?uloga=konobar";
type Artikal = { id: string; naziv: string; jedinica: string; pocetno: number | null; dopune: number };
type Artikli = { smjena: { id: string; oznaka: string; pocetak: string } | null; artikli: Artikal[] };
type Rezultat = {
  id: string;
  oznaka: string;
  kraj: string | null;
  zatvorio: string | null;
  pazarSanka: number;
  pazarStanica: number;
  ocekivaniPazar: number;
  predaniPazar: number;
  razlika: number;
  naplate: { naplaceno: number; gotovina: number; kartica: number; baksis: number; popust: number; dug: number };
};
type Pregled = { otvorena: (Rezultat & { popisPecenjare: "nema" | "otvoren" | "zatvoren" }) | null; smjene: Rezultat[]; imaJos: boolean };

const STANJE_POPISA = {
  nema: "Pečenjara još nije otvorila svoj popis.",
  otvoren: "Pečenjara je otvorila popis, ali ga još nije zaključila.",
  zatvoren: "Pečenjara je zaključila svoj popis.",
};

function RezultatSmjene({ r }: { r: Rezultat }) {
  const n = r.naplate;
  return (
    <section aria-label="Rezultat smjene" className="flex flex-col gap-2 rounded-box border-4 border-base-content p-3">
      <h3 className="text-lg font-bold">
        Smjena {r.oznaka}
        {r.kraj && `, zatvorena ${vrijemeSarajevo(r.kraj)}`}
        {r.zatvorio && ` (${r.zatvorio})`}
      </h3>
      <p>Pazar šanka po popisu: {formatKM(r.pazarSanka)}</p>
      <p>Kuhinja i pečenjara po cijeni iz menija: {formatKM(r.pazarStanica)}</p>
      <p>Očekivano: {formatKM(r.ocekivaniPazar)}</p>
      <p>Predano: {formatKM(r.predaniPazar)}</p>
      <p className="text-lg font-bold">
        {razlikaTekst(r.razlika)}
      </p>
      <div className="rounded-box bg-base-200 p-3">
        <p className="font-bold">Naplate u ovoj smjeni</p>
        <p>
          Naplaćeno: {formatKM(n.naplaceno)}, od toga gotovina {formatKM(n.gotovina)} i kartica {formatKM(n.kartica)}
        </p>
        <p>Popusti: {formatKM(n.popust)}</p>
        <p>Dugovi (na dug): {formatKM(n.dug)}</p>
        <p>Baksiš: {formatKM(n.baksis)}</p>
        <p className="mt-2">
          Popusti, dugovi i plaćanja karticom se ne odbijaju od očekivanog pazara, pa se u razlici vide kao manjak. Baksiš dat u gotovini može se vidjeti kao višak.
        </p>
      </div>
    </section>
  );
}

export default function SankPanel() {
  const [podaci, postaviPodatke] = useState<Artikli | null>(null);
  const [unos, postaviUnos] = useState<Record<string, string>>({});
  const [oznaka, postaviOznaku] = useState<"I" | "II" | "">("");
  const [predani, postaviPredani] = useState("");
  const [trazi, postaviTrazi] = useState("");
  const [greska, postaviGresku] = useState("");
  const [poruka, postaviPoruku] = useState("");
  const [rezultat, postaviRezultat] = useState<Rezultat | null>(null);
  const [dopuniArtikal, postaviDopuniArtikal] = useState("");
  const [dopunaKol, postaviDopunaKol] = useState("");
  const zauzeto = useRef(false);
  const pokusaj = useRef<{ kljuc: string; id: string } | null>(null);
  const pokusajDopune = useRef<{ kljuc: string; id: string } | null>(null);

  const pregled = useLista<Rezultat, Pregled>("/api/smjene", "smjene", PRIJAVA, 10_000);
  const popis = pregled.prvi?.otvorena?.popisPecenjare;

  // The drink list is read on load and after each save, never on a timer, so nothing under the typing hand moves.
  useEffect(() => {
    let zivo = true;
    pozovi<Artikli>("/api/sank/artikli", PRIJAVA).then((r) => zivo && (r.ok ? postaviPodatke(r.podaci) : postaviGresku(r.greska)));
    return () => {
      zivo = false;
    };
  }, []);

  async function osvjezi() {
    const r = await pozovi<Artikli>("/api/sank/artikli", PRIJAVA);
    if (r.ok) postaviPodatke(r.podaci);
    await pregled.iznova();
  }

  function dalje(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const polja = [...document.querySelectorAll<HTMLInputElement>("input[data-popis]")];
    polja[polja.indexOf(e.currentTarget) + 1]?.focus();
  }

  // One save at a time behind a ref, so a double tap sends once.
  async function jednom(radi: () => Promise<void>) {
    if (zauzeto.current) return;
    zauzeto.current = true;
    postaviGresku("");
    postaviPoruku("");
    try {
      await radi();
    } finally {
      zauzeto.current = false;
    }
  }

  function popisIz() {
    const sva = podaci?.artikli ?? [];
    const popis = sva.map((a) => ({ proizvodId: a.id, kolicina: kolicinaIzUnosa(unos[a.id] ?? "") }));
    const fale = sva.filter((_, i) => Number.isNaN(popis[i].kolicina));
    if (fale.length) {
      postaviGresku(
        `Upišite stanje za sva pića, još ${fale.length}: ${fale
          .slice(0, 3)
          .map((a) => a.naziv)
          .join(", ")}${fale.length > 3 ? "…" : ""}. Količina ima najviše tri decimale.`,
      );
      return null;
    }
    return popis;
  }

  function otvori(e: React.FormEvent) {
    e.preventDefault();
    if (!oznaka) return postaviGresku("Izaberite prvu ili drugu smjenu.");
    const popis = popisIz();
    if (!popis) return;
    return jednom(async () => {
      const id = idPokusaja(pokusaj, JSON.stringify([oznaka, popis]));
      const r = await pozovi("/api/smjene", PRIJAVA, "POST", { requestId: id, oznaka, popis });
      if (!r.ok) return postaviGresku(r.greska);
      pokusaj.current = null;
      postaviUnos({});
      postaviRezultat(null);
      postaviPoruku("Smjena je otvorena.");
      await osvjezi();
    });
  }

  function zatvori(e: React.FormEvent) {
    e.preventDefault();
    const popis = popisIz();
    if (!popis || !podaci?.smjena) return;
    const p = novacIzUnosa(predani);
    if (Number.isNaN(p)) return postaviGresku("Unesite predani pazar, na primjer 245,50.");
    const smjenaId = podaci.smjena.id;
    return jednom(async () => {
      const id = idPokusaja(pokusaj, JSON.stringify([smjenaId, popis, p]));
      const r = await pozovi<{ smjena: Rezultat }>("/api/smjene", PRIJAVA, "PATCH", { requestId: id, smjenaId, popis, predaniPazar: p });
      if (!r.ok) return postaviGresku(r.greska);
      pokusaj.current = null;
      postaviUnos({});
      postaviPredani("");
      postaviRezultat(r.podaci.smjena);
      await osvjezi();
    });
  }

  function dopuni(e: React.FormEvent) {
    e.preventDefault();
    const k = kolicinaIzUnosa(dopunaKol);
    if (!dopuniArtikal || Number.isNaN(k) || k <= 0) return postaviGresku("Izaberite piće i unesite količinu dopune veću od nule.");
    return jednom(async () => {
      const id = idPokusaja(pokusajDopune, JSON.stringify([dopuniArtikal, k]));
      const r = await pozovi("/api/sank/dopune", PRIJAVA, "POST", { requestId: id, proizvodId: dopuniArtikal, kolicina: k });
      if (!r.ok) return postaviGresku(r.greska);
      pokusajDopune.current = null;
      postaviDopunaKol("");
      postaviPoruku("Dopuna je upisana.");
      await osvjezi();
    });
  }

  const otvorena = podaci?.smjena ?? null;
  const artikli = podaci?.artikli ?? [];
  const prikaz = artikli.filter((a) => a.naziv.toLowerCase().includes(trazi.trim().toLowerCase()));
  const upisano = artikli.filter((a) => (unos[a.id] ?? "").trim() !== "").length;

  return (
    <div className="flex flex-col gap-4">
      <p>
        <Link href="/sank" className={`${dugme} inline-flex items-center`}>
          Red narudžbi
        </Link>
      </p>
      <p role="alert" className="font-bold text-error">
        {greska || pregled.greska}
      </p>
      <p role="status">{poruka}</p>
      {!podaci && !greska && <p role="status">Učitavam…</p>}
      {rezultat && <RezultatSmjene r={rezultat} />}

      {podaci && (
        <section aria-label={otvorena ? "Zatvaranje smjene" : "Otvaranje smjene"} className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">{otvorena ? `Smjena ${otvorena.oznaka} je otvorena` : "Otvaranje smjene"}</h2>

          {otvorena && (
            <>
              <form onSubmit={dopuni} className="flex flex-col gap-3 rounded-box border-2 border-dim p-3" aria-label="Dopuna">
                <h3 className="font-bold">Dopuna pića</h3>
                <label className="flex flex-col gap-1">
                  Piće za dopunu
                  <select value={dopuniArtikal} onChange={(e) => postaviDopuniArtikal(e.target.value)} className={polje}>
                    <option value="">Izaberite…</option>
                    {artikli.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.naziv}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  Količina dopune
                  <input inputMode="decimal" value={dopunaKol} onChange={(e) => postaviDopunaKol(e.target.value)} className={polje} />
                </label>
                <button type="submit" className={dugme}>
                  Dodaj dopunu
                </button>
              </form>
              <div className="rounded-box border-2 border-dim p-3">
                {popis && popis !== "zatvoren" && (
                  <p role="alert" className="font-bold text-error">
                    Smjena se ne može zatvoriti dok pečenjara ne zaključi svoj popis. {STANJE_POPISA[popis]}
                  </p>
                )}
                {popis === "zatvoren" && <p>{STANJE_POPISA.zatvoren}</p>}
              </div>
            </>
          )}

          <form onSubmit={otvorena ? zatvori : otvori} className="flex flex-col gap-3" aria-label="Popis pića">
            {!otvorena && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Smjena">
                {(["I", "II"] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={oznaka === o}
                    onClick={() => postaviOznaku(o)}
                    className={dugme}
                  >
                    {o === "I" ? "Prva smjena (I)" : "Druga smjena (II)"}
                  </button>
                ))}
              </div>
            )}
            <h3 className="font-bold">{otvorena ? "Završni popis" : "Početni popis"}</h3>
            <label className="flex flex-col gap-1">
              Traži piće
              <input type="search" value={trazi} onChange={(e) => postaviTrazi(e.target.value)} className={polje} />
            </label>
            <p>
              Upisano {upisano} od {artikli.length}. Enter prelazi na sljedeće polje.
            </p>
            <ul className="grid gap-2 md:grid-cols-2">
              {prikaz.map((a) => (
                <li key={a.id}>
                  <label className="flex min-h-14 items-center gap-3 rounded-box border-2 border-dim px-3 py-1">
                    <span className="flex-1">
                      {a.naziv} ({a.jedinica})
                      {otvorena && (
                        <span className="block text-sm">
                          početno {formatBroj(a.pocetno ?? 0)}, dopune {formatBroj(a.dopune)}
                        </span>
                      )}
                    </span>
                    <input
                      data-popis
                      inputMode="decimal"
                      enterKeyHint="next"
                      value={unos[a.id] ?? ""}
                      onChange={(e) => postaviUnos({ ...unos, [a.id]: e.target.value })}
                      onKeyDown={dalje}
                      className="input input-lg polje-rub w-24"
                    />
                  </label>
                </li>
              ))}
            </ul>
            {prikaz.length === 0 && <p>Nema takvog pića.</p>}
            {otvorena && (
              <label className="flex flex-col gap-1">
                Predani pazar (KM)
                <input data-popis inputMode="decimal" value={predani} onChange={(e) => postaviPredani(e.target.value)} onKeyDown={dalje} className={polje} />
              </label>
            )}
            <button type="submit" className={glavno}>
              {otvorena ? "Zatvori smjenu" : "Otvori smjenu"}
            </button>
          </form>
        </section>
      )}

      {pregled.stavke && pregled.stavke.length > 0 && (
        <section aria-label="Prethodne smjene" className="flex flex-col gap-2">
          <h2 className="text-xl font-bold">Prethodne smjene</h2>
          {pregled.stavke.map((s) => (
            <details key={s.id} className="rounded-box border-2 border-dim p-2">
              <summary className="flex min-h-12 items-center">
                Smjena {s.oznaka}, {s.kraj && vrijemeSarajevo(s.kraj)}, {razlikaTekst(s.razlika)}
              </summary>
              <RezultatSmjene r={s} />
            </details>
          ))}
          {pregled.imaJos && (
            <button type="button" onClick={pregled.jos} className={dugme}>
              Starije smjene
            </button>
          )}
        </section>
      )}
    </div>
  );
}
