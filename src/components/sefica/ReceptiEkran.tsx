"use client";

import { useState } from "react";
import { dugme, glavno, izbor } from "@/components/konobar/stil";
import { formatBroj, formatKM } from "@/lib/format";
import { useSlanje, useUcitaj, zovi } from "./api";
import { kolicinaIzUnosa } from "./pomocno";
import { Greska, Polje, Tabela } from "./ui";

type Meni = { kategorije: { id: string; naziv: string; proizvodi: { id: string; naziv: string }[] }[] };
type Stavka = { id: string; naziv: string; jedinica: string };
type Recept = { proizvodId: string; naziv: string; sastojci: { zalihaId: string; naziv: string; jedinica: string; kolicina: number }[] };
type Nabavka = {
  id: string;
  naziv: string;
  jedinica: string;
  stanje: number;
  minimum: number;
  ispodMinimuma: boolean;
  nabavnaCijena: number | null;
  utrosak7Dana: number;
  predlozenaNabavka: number;
};
type Red = { zalihaId: string; kolicina: string };

function Uredjivac({ proizvodId, naziv, postojeci, zaliha, gotovo }: { proizvodId: string; naziv: string; postojeci: Recept | undefined; zaliha: Stavka[]; gotovo: (p: string) => void }) {
  const [redovi, postaviRedove] = useState<Red[]>(postojeci?.sastojci.map((s) => ({ zalihaId: s.zalihaId, kolicina: formatBroj(s.kolicina) })) ?? []);
  const [lokalno, postaviLokalno] = useState("");
  const { saljem, greska, posalji } = useSlanje();

  const izmijeni = (i: number, dio: Partial<Red>) => postaviRedove(redovi.map((r, j) => (j === i ? { ...r, ...dio } : r)));

  async function spremi() {
    const sastojci = redovi.map((r) => ({ zalihaId: r.zalihaId, kolicina: kolicinaIzUnosa(r.kolicina, 3) }));
    if (sastojci.some((s) => !s.zalihaId || Number.isNaN(s.kolicina) || s.kolicina <= 0 || s.kolicina > 1000)) {
      return postaviLokalno("Svaki sastojak treba artikal i količinu od 0,001 do 1.000.");
    }
    if (new Set(sastojci.map((s) => s.zalihaId)).size !== sastojci.length) return postaviLokalno("Isti artikal je naveden dva puta.");
    postaviLokalno("");
    const r = await posalji(JSON.stringify(sastojci), () => zovi("/api/zaliha/recepti", "POST", { proizvodId, sastojci }));
    if (r) gotovo(sastojci.length === 0 ? `Recept za „${naziv}“ je uklonjen.` : `Recept za „${naziv}“ je spremljen.`);
  }

  return (
    <section aria-label={`Recept: ${naziv}`} className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold break-words">Recept: {naziv}</h3>
      {redovi.length === 0 && <p>Jelo nema recept. Dodajte sastojke, ili ostavite prazno.</p>}
      <ul className="flex flex-col gap-3">
        {redovi.map((r, i) => (
          <li key={i} className="grid gap-2 rounded-lg border-2 border-okvir p-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
            <label className="flex flex-col gap-1">
              Sastojak {i + 1}
              <select className={izbor} value={r.zalihaId} onChange={(e) => izmijeni(i, { zalihaId: e.target.value })}>
                <option value="">Izaberite artikal</option>
                {zaliha.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.naziv} ({a.jedinica})
                  </option>
                ))}
              </select>
            </label>
            <Polje oznaka={`Količina ${i + 1}`} vrijednost={r.kolicina} onChange={(v) => izmijeni(i, { kolicina: v })} />
            <button type="button" className={dugme} aria-label={`Ukloni sastojak ${i + 1}`} onClick={() => postaviRedove(redovi.filter((_, j) => j !== i))}>
              Ukloni
            </button>
          </li>
        ))}
      </ul>
      <Greska tekst={lokalno || greska} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={dugme} disabled={redovi.length >= 50} onClick={() => postaviRedove([...redovi, { zalihaId: "", kolicina: "" }])}>
          Dodaj sastojak
        </button>
        <button type="button" className={glavno} aria-disabled={saljem} onClick={spremi}>
          {saljem ? "Spremam…" : "Spremi recept"}
        </button>
      </div>
    </section>
  );
}

function Prijedlog({ verzija }: { verzija: number }) {
  // t is ignored by the route; it only makes the address new after a recipe changed.
  const { podaci: p, greska, ucitano } = useUcitaj<{ nabavka: Nabavka[] }>(`/api/zaliha/nabavka?t=${verzija}`);
  const potrebno = p?.nabavka.filter((a) => a.predlozenaNabavka > 0) ?? [];
  return (
    <section aria-label="Prijedlog nabavke" className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">Prijedlog nabavke</h2>
      <p>
        Računa se iz recepata prodatih jela i prodaje mesnice u zadnjih 7 dana, plus 20 %. Stanje na zalihi je prikazano, ali nije oduzeto.
        Artikli bez recepta nemaju potrošnju, pa ni prijedlog.
      </p>
      <Greska tekst={greska} />
      {!ucitano && !greska && <p role="status">Računam prijedlog…</p>}
      {p && potrebno.length === 0 && <p>Nema prijedloga: nijedan artikal nema potrošnju u zadnjih 7 dana. Prijedlog se pojavi kad jela dobiju recepte i budu prodana.</p>}
      {p && potrebno.length > 0 && (
        <Tabela
          naslov="Prijedlog po artiklima"
          kolone={["Artikal", "Potrošnja 7 dana", "Predloženo", "Stanje", "Minimum", "Nabavna cijena"]}
          redovi={potrebno.map((a) => [
            a.naziv,
            `${formatBroj(a.utrosak7Dana)} ${a.jedinica}`,
            `${formatBroj(a.predlozenaNabavka)} ${a.jedinica}`,
            `${formatBroj(a.stanje)} ${a.jedinica}${a.ispodMinimuma ? " (ispod minimuma)" : ""}`,
            `${formatBroj(a.minimum)} ${a.jedinica}`,
            a.nabavnaCijena === null ? "nije postavljena" : formatKM(a.nabavnaCijena),
          ])}
          prazno=""
        />
      )}
    </section>
  );
}

export default function ReceptiEkran() {
  const meni = useUcitaj<Meni>("/api/meni");
  const zaliha = useUcitaj<{ zaliha: Stavka[] }>("/api/zaliha");
  const recepti = useUcitaj<{ recepti: Recept[] }>("/api/zaliha/recepti");
  const [izbor, postaviIzbor] = useState("");
  const [poruka, postaviPoruku] = useState("");
  const [verzija, postaviVerziju] = useState(0);

  const jela = meni.podaci?.kategorije.flatMap((k) => k.proizvodi) ?? [];
  const jelo = jela.find((j) => j.id === izbor);
  const greska = meni.greska || zaliha.greska || recepti.greska;
  const spremno = meni.ucitano && zaliha.ucitano && recepti.ucitano;

  return (
    <div className="flex flex-col gap-6">
      <Greska tekst={greska} />
      {!spremno && !greska && <p role="status">Učitavam…</p>}
      {spremno && (
        <>
          <section aria-label="Recepti" className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">Recepti</h2>
            <p>Recept kaže koliko zalihe jedna porcija jela troši. Samo jela s receptom ulaze u prijedlog nabavke.</p>
            {poruka && <p role="status" className="font-semibold">{poruka}</p>}
            {zaliha.podaci!.zaliha.length === 0 && <p>Zaliha je prazna, pa nema sastojaka za recepte.</p>}
            <label className="flex flex-col gap-1">
              Jelo
              <select className={izbor} value={izbor} onChange={(e) => (postaviIzbor(e.target.value), postaviPoruku(""))}>
                <option value="">Izaberite jelo</option>
                {meni.podaci!.kategorije.map((k) => (
                  <optgroup key={k.id} label={k.naziv}>
                    {k.proizvodi.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.naziv}
                        {recepti.podaci!.recepti.some((r) => r.proizvodId === p.id) ? " (ima recept)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {jelo && (
              <Uredjivac
                key={jelo.id}
                proizvodId={jelo.id}
                naziv={jelo.naziv}
                postojeci={recepti.podaci!.recepti.find((r) => r.proizvodId === jelo.id)}
                zaliha={zaliha.podaci!.zaliha}
                gotovo={(p) => {
                  postaviPoruku(p);
                  recepti.osvjezi();
                  postaviVerziju((v) => v + 1);
                }}
              />
            )}
            <Tabela
              naslov="Jela s receptom"
              kolone={["Jelo", "Sastojci"]}
              redovi={recepti.podaci!.recepti.map((r) => [r.naziv, r.sastojci.map((s) => `${s.naziv} ${formatBroj(s.kolicina)} ${s.jedinica}`).join(", ")])}
              prazno="Još nijedno jelo nema recept."
            />
          </section>
          <Prijedlog verzija={verzija} />
        </>
      )}
    </div>
  );
}
