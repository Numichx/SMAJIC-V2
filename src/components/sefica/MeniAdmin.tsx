"use client";

import { useState } from "react";
import { dugme, glavno, polje } from "@/components/konobar/stil";
import { formatKM } from "@/lib/format";
import { useSlanje, useUcitaj, zovi } from "./api";
import { cijenaIzUnosa, potvrdaCijenePotrebna, redoslijedIzUnosa } from "./meniAdminPomocno";
import { Greska, Polje } from "./ui";

type Kategorija = { id: string; naziv: string };
type Proizvod = {
  id: string;
  kategorijaId: string;
  naziv: string;
  cijena: number;
  jedinica: string;
  stanica: string;
  redoslijed: number;
  aktivan: boolean;
  tezina: boolean;
  jePrilog: boolean;
  besplatniPrilozi: string[];
  slika: { putanja: string; zasluge: string | null } | null;
};
type Meni = { kategorije: Kategorija[]; proizvodi: Proizvod[] };
type PoljaProizvoda = {
  naziv: string;
  kategorijaId: string;
  cijena: string;
  jedinica: string;
  stanica: string;
  redoslijed: string;
};

const JEDINICE = [
  ["porcija", "Porcija"],
  ["kom", "Komad"],
  ["kg", "Kilogram"],
  ["l", "Litar"],
] as const;
const STANICE = [
  ["kuhinja", "Kuhinja"],
  ["pecenjara", "Pečenjara"],
  ["sank", "Šank"],
] as const;

function polja(proizvod?: Proizvod): PoljaProizvoda {
  return {
    naziv: proizvod?.naziv ?? "",
    kategorijaId: proizvod?.kategorijaId ?? "",
    cijena: proizvod ? String(proizvod.cijena).replace(".", ",") : "",
    jedinica: proizvod?.jedinica ?? "porcija",
    stanica: proizvod?.stanica ?? "kuhinja",
    redoslijed: proizvod ? String(proizvod.redoslijed) : "",
  };
}

function ProizvodForma({
  kategorije,
  proizvod,
  gotovo,
  odustani,
}: {
  kategorije: Kategorija[];
  proizvod?: Proizvod;
  gotovo: () => void;
  odustani?: () => void;
}) {
  const [vrijednosti, postaviVrijednosti] = useState(() => polja(proizvod));
  const [lokalnaGreska, postaviLokalnuGresku] = useState("");
  const [potvrda, postaviPotvrdu] = useState<string | null>(null);
  const { saljem, greska, postaviGresku, posalji } = useSlanje();
  const cijenaPotvrde = cijenaIzUnosa(vrijednosti.cijena);

  function promijeni<K extends keyof PoljaProizvoda>(kljuc: K, vrijednost: PoljaProizvoda[K]) {
    postaviVrijednosti((staro) => ({ ...staro, [kljuc]: vrijednost }));
    postaviPotvrdu(null);
    postaviLokalnuGresku("");
    postaviGresku("");
  }

  async function spremi() {
    const cijena = cijenaIzUnosa(vrijednosti.cijena);
    if (cijena === null) {
      postaviLokalnuGresku("Cijena mora biti od 0,01 do 9.999,99 KM, s najviše dvije decimale.");
      return;
    }
    const redoslijed = redoslijedIzUnosa(vrijednosti.redoslijed);
    if (!redoslijed.ispravno) {
      postaviLokalnuGresku("Redoslijed mora biti od 1 do 9.999 ili ostavite prazno.");
      return;
    }
    postaviLokalnuGresku("");
    const tijelo = {
      naziv: vrijednosti.naziv.trim(),
      kategorijaId: vrijednosti.kategorijaId,
      cijena,
      jedinica: vrijednosti.jedinica,
      stanica: vrijednosti.stanica,
      ...(redoslijed.vrijednost === undefined ? {} : { redoslijed: redoslijed.vrijednost }),
    };
    const kljuc = `${proizvod?.id ?? "novi"}|${JSON.stringify(tijelo)}`;
    if (potvrdaCijenePotrebna(proizvod?.cijena, cijena) && potvrda !== kljuc) {
      postaviPotvrdu(kljuc);
      return;
    }

    const odgovor = await posalji(kljuc, () =>
      proizvod
        ? zovi("/api/administracija/meni", "PATCH", { id: proizvod.id, ...tijelo })
        : zovi("/api/administracija/meni", "POST", tijelo),
    );
    if (odgovor) gotovo();
  }

  return (
    <section aria-label={proizvod ? `Izmjena: ${proizvod.naziv}` : "Novi proizvod"} className="flex flex-col gap-3 rounded-lg border-2 border-okvir p-3">
      <h3 className="text-lg font-semibold">{proizvod ? `Izmjena: ${proizvod.naziv}` : "Novi proizvod"}</h3>
      <Polje oznaka="Naziv" vrijednost={vrijednosti.naziv} onChange={(v) => promijeni("naziv", v)} tip="text" maxLength={100} />
      <label className="flex flex-col gap-1">
        Kategorija
        <select className={polje} value={vrijednosti.kategorijaId} onChange={(e) => promijeni("kategorijaId", e.target.value)}>
          <option value="">Izaberite kategoriju</option>
          {kategorije.map((k) => (
            <option key={k.id} value={k.id}>{k.naziv}</option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Polje oznaka="Cijena (KM)" vrijednost={vrijednosti.cijena} onChange={(v) => promijeni("cijena", v)} />
        <Polje oznaka="Redoslijed" vrijednost={vrijednosti.redoslijed} onChange={(v) => promijeni("redoslijed", v)} tip="numeric" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          Jedinica
          <select className={polje} value={vrijednosti.jedinica} onChange={(e) => promijeni("jedinica", e.target.value)}>
            {JEDINICE.map(([id, naziv]) => <option key={id} value={id}>{naziv}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Stanica
          <select className={polje} value={vrijednosti.stanica} onChange={(e) => promijeni("stanica", e.target.value)}>
            {STANICE.map(([id, naziv]) => <option key={id} value={id}>{naziv}</option>)}
          </select>
        </label>
      </div>
      {proizvod && (
        <div className="rounded-lg bg-povrsina p-3">
          <p>Automatska pravila se ne uređuju ovdje.</p>
          <p>Važe se: {proizvod.tezina ? "da" : "ne"}</p>
          <p>Prilog: {proizvod.jePrilog ? "da" : "ne"}</p>
          <p>Besplatni prilozi: {proizvod.besplatniPrilozi.length > 0 ? proizvod.besplatniPrilozi.join(", ") : "nema"}</p>
          {proizvod.slika && <p>Fotografija: {proizvod.slika.zasluge ?? proizvod.slika.putanja}</p>}
        </div>
      )}
      <Greska tekst={lokalnaGreska || greska} />
      {potvrda && cijenaPotvrde !== null && potvrdaCijenePotrebna(proizvod?.cijena, cijenaPotvrde) && (
        <p role="status" className="font-semibold">
          {proizvod
            ? `Cijena se mijenja sa ${formatKM(proizvod.cijena)} na ${formatKM(cijenaPotvrde)}.`
            : `Novi proizvod će biti ponuđen po cijeni ${formatKM(cijenaPotvrde)}.`}
          {" "}Ponovo pritisnite dugme za potvrdu.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={glavno} disabled={saljem} onClick={spremi}>
          {saljem
            ? "Spremam…"
            : potvrda && cijenaPotvrde !== null && potvrdaCijenePotrebna(proizvod?.cijena, cijenaPotvrde)
              ? "Potvrdi i sačuvaj"
              : "Sačuvaj"}
        </button>
        {odustani && <button type="button" className={dugme} onClick={odustani}>Odustani</button>}
      </div>
    </section>
  );
}

function StavkaProizvoda({ proizvod, kategorija, kategorije, osvjezi }: {
  proizvod: Proizvod;
  kategorija: string;
  kategorije: Kategorija[];
  osvjezi: () => void;
}) {
  const [uredi, postaviUredi] = useState(false);
  const [greskaLokalna, postaviGreskuLokalnu] = useState("");
  const { saljem, greska, posalji } = useSlanje();

  async function promijeniDostupnost() {
    postaviGreskuLokalnu("");
    const aktivan = !proizvod.aktivan;
    const odgovor = await posalji(`status|${proizvod.id}|${aktivan}`, () =>
      zovi("/api/administracija/meni", "PATCH", { id: proizvod.id, aktivan }),
    );
    if (odgovor) osvjezi();
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border-2 border-okvir p-3">
      {!uredi ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-semibold break-words">{proizvod.naziv}</p>
              <p>{formatKM(proizvod.cijena)} · {proizvod.jedinica} · {proizvod.stanica}</p>
              <p>Redoslijed: {proizvod.redoslijed} · {proizvod.aktivan ? "U ponudi" : "Rasprodano / skriveno"}</p>
              <p>Važe se: {proizvod.tezina ? "da" : "ne"} · Prilog: {proizvod.jePrilog ? "da" : "ne"}</p>
              <p>Besplatni prilozi: {proizvod.besplatniPrilozi.length > 0 ? proizvod.besplatniPrilozi.join(", ") : "nema"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={dugme} aria-label={`Uredi ${proizvod.naziv}`} onClick={() => postaviUredi(true)}>Uredi</button>
              <button type="button" className={dugme} disabled={saljem} onClick={promijeniDostupnost}>
                {saljem ? "Spremam…" : proizvod.aktivan ? "Označi rasprodano" : "Vrati u ponudu"}
              </button>
            </div>
          </div>
          <Greska tekst={greskaLokalna || greska} />
        </>
      ) : (
        <ProizvodForma
          kategorije={kategorije}
          proizvod={proizvod}
          gotovo={() => { postaviUredi(false); osvjezi(); }}
          odustani={() => postaviUredi(false)}
        />
      )}
      <span className="sr-only">Kategorija: {kategorija}</span>
    </li>
  );
}

export default function MeniAdmin() {
  const { podaci, greska, ucitano, osvjezi } = useUcitaj<Meni>("/api/administracija/meni");
  const [dodaje, postaviDodaje] = useState(false);
  const kategorije = podaci?.kategorije ?? [];

  return (
    <div className="flex flex-col gap-6">
      <p>Izmjene cijena i dostupnosti ne mijenjaju već poslane narudžbe. Proizvodi na otvorenom popisu ostaju zaštićeni pravilima smjene.</p>
      <Greska tekst={greska} />
      {!ucitano && !greska && <p role="status">Učitavam meni…</p>}
      {ucitano && (
        <>
          {!dodaje ? (
            <div>
              <button type="button" className={glavno} onClick={() => postaviDodaje(true)}>Dodaj proizvod</button>
            </div>
          ) : (
            <ProizvodForma
              kategorije={kategorije}
              gotovo={() => { postaviDodaje(false); osvjezi(); }}
              odustani={() => postaviDodaje(false)}
            />
          )}
          {kategorije.map((k) => {
            const proizvodi = (podaci?.proizvodi ?? []).filter((p) => p.kategorijaId === k.id);
            return (
              <section key={k.id} aria-label={k.naziv} className="flex flex-col gap-3">
                <h2 className="text-xl font-semibold">{k.naziv}</h2>
                {proizvodi.length === 0 ? <p>Nema proizvoda u kategoriji.</p> : (
                  <ul className="flex flex-col gap-2">
                    {proizvodi.map((p) => (
                      <StavkaProizvoda key={p.id} proizvod={p} kategorija={k.naziv} kategorije={kategorije} osvjezi={osvjezi} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
