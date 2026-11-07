"use client";

import { useState } from "react";
import { dugme, glavno, izbor } from "@/components/konobar/stil";
import { formatBroj, formatKM } from "@/lib/format";
import { useSlanje, useUcitaj, zovi } from "./api";
import { formatVrijeme, kolicinaIzUnosa } from "./pomocno";
import MesnicaZahtjevi from "./MesnicaZahtjevi";
import { Greska, kartica, Polje, Strane, Tabela } from "./ui";

export type Artikal = {
  id: string;
  naziv: string;
  jedinica: string;
  stanje: number;
  minimum: number;
  ispodMinimuma: boolean;
  prodajnaCijena: number | null;
  nabavnaCijena?: number | null;
};
type Uloga = "sefica" | "mesnica";

const RAZLOZI = ["Popis", "Prijem robe", "Višak", "Otpis"];
const znak = (n: number) => (n > 0 ? `+${formatBroj(n)}` : formatBroj(n));
const cijenaTekst = (c: number | null | undefined) => (c === null || c === undefined ? "nije postavljena" : formatKM(c));

function PopisForma({ a, gotovo }: { a: Artikal; gotovo: (poruka: string) => void }) {
  const [stanje, postaviStanje] = useState("");
  const [razlog, postaviRazlog] = useState("Popis");
  const [lokalno, postaviLokalno] = useState("");
  const { saljem, greska, posalji } = useSlanje();

  async function spremi() {
    const s = kolicinaIzUnosa(stanje, 3);
    if (Number.isNaN(s) || s > 100000) return postaviLokalno("Unesite stanje od 0 do 100.000, s najviše tri decimale.");
    postaviLokalno("");
    const r = await posalji(`${s}|${razlog}`, (requestId) =>
      zovi<{ promet: { promjena: number; stanje: number } }>("/api/zaliha/promet", "POST", { requestId, zalihaId: a.id, stanje: s, razlog }),
    );
    if (r) gotovo(`${a.naziv}: stanje je sada ${formatBroj(r.promet.stanje)} ${a.jedinica} (promjena ${znak(r.promet.promjena)}).`);
  }

  return (
    <section aria-label={`Popis: ${a.naziv}`} className="flex flex-col gap-3 border-t-2 border-dim pt-3">
      <Polje oznaka={`Stvarno stanje na polici (${a.jedinica})`} vrijednost={stanje} onChange={postaviStanje} />
      <label className="flex flex-col gap-1">
        Razlog
        <select className={izbor} value={razlog} onChange={(e) => postaviRazlog(e.target.value)}>
          {RAZLOZI.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <Greska tekst={lokalno || greska} />
      <div>
        <button type="button" className={glavno} aria-disabled={saljem} onClick={spremi}>
          {saljem ? "Spremam…" : "Spremi stanje"}
        </button>
      </div>
    </section>
  );
}

function UrediForma({ a, gotovo }: { a: Artikal; gotovo: (poruka: string) => void }) {
  const tekst = (n: number | null | undefined) => (n === null || n === undefined ? "" : formatBroj(n));
  const [minimum, postaviMinimum] = useState(tekst(a.minimum));
  const [nabavna, postaviNabavnu] = useState(tekst(a.nabavnaCijena));
  const [prodajna, postaviProdajnu] = useState(tekst(a.prodajnaCijena));
  const [lokalno, postaviLokalno] = useState("");
  const { saljem, greska, posalji } = useSlanje();

  async function spremi() {
    const m = kolicinaIzUnosa(minimum, 3);
    const n = nabavna.trim() === "" ? null : kolicinaIzUnosa(nabavna, 2);
    const p = prodajna.trim() === "" ? null : kolicinaIzUnosa(prodajna, 2);
    if (Number.isNaN(m) || (n !== null && Number.isNaN(n)) || (p !== null && Number.isNaN(p))) {
      return postaviLokalno("Minimum ima najviše tri decimale, cijene dvije. Prazna cijena znači da cijena nije postavljena.");
    }
    postaviLokalno("");
    const r = await posalji(`${m}|${n}|${p}`, () => zovi("/api/zaliha", "PATCH", { id: a.id, minimum: m, nabavnaCijena: n, prodajnaCijena: p }));
    if (r) gotovo(`${a.naziv}: izmjene su spremljene.`);
  }

  return (
    <section aria-label={`Izmjena: ${a.naziv}`} className="flex flex-col gap-3 border-t-2 border-dim pt-3">
      <Polje oznaka={`Minimum (${a.jedinica})`} vrijednost={minimum} onChange={postaviMinimum} />
      <Polje oznaka="Nabavna cijena (KM)" vrijednost={nabavna} onChange={postaviNabavnu} />
      <Polje oznaka="Prodajna cijena u mesnici (KM)" vrijednost={prodajna} onChange={postaviProdajnu} />
      <Greska tekst={lokalno || greska} />
      <div>
        <button type="button" className={glavno} aria-disabled={saljem} onClick={spremi}>
          {saljem ? "Spremam…" : "Spremi izmjene"}
        </button>
      </div>
    </section>
  );
}

function ProdajaForma({ a, gotovo }: { a: Artikal; gotovo: (poruka: string) => void }) {
  const [kolicina, postaviKolicinu] = useState("");
  const [lokalno, postaviLokalno] = useState("");
  const { saljem, greska, posalji } = useSlanje();

  async function prodaj() {
    const k = kolicinaIzUnosa(kolicina, 3);
    if (Number.isNaN(k) || k <= 0 || k > 100000) return postaviLokalno("Unesite količinu veću od nule, s najviše tri decimale.");
    postaviLokalno("");
    const r = await posalji(String(k), (requestId) =>
      zovi<{ prodaja: { kolicina: number; cijena: number; iznos: number; stanje: number } }>("/api/zaliha/prodaja", "POST", {
        requestId,
        zalihaId: a.id,
        kolicina: k,
      }),
    );
    if (r) {
      const p = r.prodaja;
      gotovo(`${a.naziv}: prodano ${formatBroj(p.kolicina)} ${a.jedinica} po ${formatKM(p.cijena)}, ukupno ${formatKM(p.iznos)}. Stanje: ${formatBroj(p.stanje)} ${a.jedinica}.`);
    }
  }

  return (
    <section aria-label={`Prodaja: ${a.naziv}`} className="flex flex-col gap-3 border-t-2 border-dim pt-3">
      {a.prodajnaCijena === null ? (
        <p role="alert" className="font-bold text-error">
          Prodajna cijena nije postavljena, pa prodaja nije moguća. Javite se šefici.
        </p>
      ) : (
        <>
          <p>Cijena: {formatKM(a.prodajnaCijena)} po {a.jedinica}. Na stanju: {formatBroj(a.stanje)} {a.jedinica}.</p>
          <Polje oznaka={`Količina (${a.jedinica})`} vrijednost={kolicina} onChange={postaviKolicinu} />
          <Greska tekst={lokalno || greska} />
          <div>
            <button type="button" className={glavno} aria-disabled={saljem} onClick={prodaj}>
              {saljem ? "Prodajem…" : "Prodaj"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function Lista({ uloga, zaliha, osvjezi }: { uloga: Uloga; zaliha: Artikal[]; osvjezi: () => void }) {
  const [filter, postaviFilter] = useState("");
  const [otvoreno, postaviOtvoreno] = useState<{ id: string; vrsta: "popis" | "uredi" | "prodaja" } | null>(null);
  const [poruka, postaviPoruku] = useState("");

  const prikaz = zaliha.filter((a) => a.naziv.toLowerCase().includes(filter.trim().toLowerCase()));
  const gotovo = (p: string) => {
    postaviPoruku(p);
    postaviOtvoreno(null);
    osvjezi();
  };
  const dugmeZa = (a: Artikal, vrsta: "popis" | "uredi" | "prodaja", naziv: string) => (
    <button
      type="button"
      className={`${dugme} aria-expanded:border-base-content`}
      aria-expanded={otvoreno?.id === a.id && otvoreno.vrsta === vrsta}
      aria-label={`${naziv}: ${a.naziv}`}
      onClick={() => postaviOtvoreno(otvoreno?.id === a.id && otvoreno.vrsta === vrsta ? null : { id: a.id, vrsta })}
    >
      {naziv}
    </button>
  );

  return (
    <section aria-label="Zaliha" className="flex flex-col gap-3">
      <h3 className="text-lg font-bold">Zaliha</h3>
      {poruka && <p role="status" className="font-bold">{poruka}</p>}
      <Polje oznaka="Traži artikal" vrijednost={filter} onChange={postaviFilter} tip="text" />
      {zaliha.length === 0 && <p>Zaliha je prazna: nijedan artikal još nije unesen.</p>}
      {zaliha.length > 0 && prikaz.length === 0 && <p>Nijedan artikal ne odgovara pretrazi.</p>}
      <ul className="flex flex-col gap-2">
        {prikaz.map((a) => (
          <li key={a.id} className={`${kartica} gap-2`}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold break-words">{a.naziv}</p>
                <p>
                  Stanje: <strong>{formatBroj(a.stanje)} {a.jedinica}</strong>
                  {a.stanje === 0 ? " · Nema na stanju" : a.ispodMinimuma ? " · Ispod minimuma" : ""}
                </p>
                <p>
                  Minimum: {formatBroj(a.minimum)} {a.jedinica} · Prodajna cijena: {cijenaTekst(a.prodajnaCijena)}
                  {uloga === "sefica" && ` · Nabavna cijena: ${cijenaTekst(a.nabavnaCijena)}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {dugmeZa(a, "popis", "Popis")}
                {uloga === "sefica" && dugmeZa(a, "uredi", "Uredi")}
                {uloga === "mesnica" && a.jedinica === "kg" && dugmeZa(a, "prodaja", "Prodaja")}
              </div>
            </div>
            {otvoreno?.id === a.id && otvoreno.vrsta === "popis" && <PopisForma a={a} gotovo={gotovo} />}
            {otvoreno?.id === a.id && otvoreno.vrsta === "uredi" && <UrediForma a={a} gotovo={gotovo} />}
            {otvoreno?.id === a.id && otvoreno.vrsta === "prodaja" && <ProdajaForma a={a} gotovo={gotovo} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

type Promet = {
  id: number;
  artikal: string;
  jedinica: string;
  vrsta: "popis" | "prodaja" | "isporuka";
  promjena: number;
  stanje: number;
  razlog: string | null;
  cijena: number | null;
  iznos: number | null;
  zaposlenik: string;
  vrijeme: string;
};
const VRSTA = { popis: "Popis", prodaja: "Prodaja", isporuka: "Isporuka kuhinji" };

function Prometi({ zaliha, verzija }: { zaliha: Artikal[]; verzija: number }) {
  const [artikal, postaviArtikal] = useState("");
  const [vrsta, postaviVrstu] = useState("");
  const [strana, postaviStranu] = useState(1);
  // t only makes the address new after a change, so the history reloads; the route ignores it.
  const adresa = `/api/zaliha/promet?strana=${strana}${artikal ? `&zalihaId=${artikal}` : ""}${vrsta ? `&vrsta=${vrsta}` : ""}&t=${verzija}`;
  const { podaci: p, greska, ucitano } = useUcitaj<{ prometi: Promet[]; imaJos: boolean }>(adresa);

  return (
    <section aria-label="Historija prometa" className="flex flex-col gap-3">
      <h3 className="text-lg font-bold">Historija prometa</h3>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          Artikal
          <select className={izbor} value={artikal} onChange={(e) => (postaviArtikal(e.target.value), postaviStranu(1))}>
            <option value="">Svi artikli</option>
            {zaliha.map((a) => (
              <option key={a.id} value={a.id}>
                {a.naziv}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Vrsta
          <select className={izbor} value={vrsta} onChange={(e) => (postaviVrstu(e.target.value), postaviStranu(1))}>
            <option value="">Sve vrste</option>
            {Object.entries(VRSTA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Greska tekst={greska} />
      {!ucitano && !greska && <p role="status">Učitavam promet…</p>}
      {p && (
        <>
          <Tabela
            naslov="Promet zalihe"
            kolone={["Vrijeme", "Artikal", "Vrsta", "Promjena", "Stanje poslije", "Razlog / cijena", "Radnik"]}
            redovi={p.prometi.map((t) => [
              formatVrijeme(t.vrijeme),
              t.artikal,
              VRSTA[t.vrsta],
              `${znak(t.promjena)} ${t.jedinica}`,
              `${formatBroj(t.stanje)} ${t.jedinica}`,
              t.vrsta === "prodaja" && t.cijena !== null ? `${formatKM(t.cijena)}, ukupno ${formatKM(t.iznos ?? 0)}` : (t.razlog ?? "–"),
              t.zaposlenik,
            ])}
            prazno="Još nema prometa zalihe."
            tekstKolone={[0, 1, 2, 5, 6]}
          />
          <Strane strana={strana} prethodna={strana > 1 ? () => postaviStranu(strana - 1) : undefined} sljedeca={p.imaJos ? () => postaviStranu(strana + 1) : undefined} />
        </>
      )}
    </section>
  );
}

export default function ZalihaEkran({ uloga }: { uloga: Uloga }) {
  const { podaci, greska, osvjezi, ucitano } = useUcitaj<{ zaliha: Artikal[] }>("/api/zaliha");
  const [verzija, postaviVerziju] = useState(0);
  const poPromjeni = () => {
    osvjezi();
    postaviVerziju((v) => v + 1);
  };

  return (
    <div className="flex flex-col gap-6">
      <Greska tekst={greska} />
      {!ucitano && !greska && <p role="status">Učitavam zalihu…</p>}
      {podaci && (
        <>
          {uloga === "mesnica" && <MesnicaZahtjevi poPromjeni={poPromjeni} />}
          <Lista uloga={uloga} zaliha={podaci.zaliha} osvjezi={poPromjeni} />
          <Prometi zaliha={podaci.zaliha} verzija={verzija} />
        </>
      )}
    </div>
  );
}
