import { formatKM } from "@/lib/format";
import type { Sazetak } from "./StoloviPregled";

export type Racun = Sazetak & {
  narudzbe: {
    id: string;
    stanica: string;
    status: "Novo" | "U pripremi" | "Gotovo" | "Izdato";
    kreirano: string;
    stavke: {
      id: number;
      naziv: string;
      jedinica: string;
      kolicina: number;
      cijena: number;
      iznos: number;
      napomena: string | null;
      prilogUz: number | null;
      poseban: boolean;
    }[];
  }[];
};

type StavkaRacuna = Racun["narudzbe"][number]["stavke"][number];

const nazivStanice: Record<string, string> = { kuhinja: "Kuhinja", pecenjara: "Pečenjara", sank: "Šank" };

function Prilog({ p, uz }: { p: StavkaRacuna; uz?: string }) {
  return (
    <div className="flex justify-between gap-2 pl-4">
      <span>
        + {p.naziv}
        {uz && ` uz ${uz}`}
        {p.poseban && " (poseban)"}
      </span>
      <span>{p.cijena === 0 ? "uključeno" : formatKM(p.iznos)}</span>
    </div>
  );
}

export default function RacunPrikaz({ racun }: { racun: Racun }) {
  const sve = racun.narudzbe.flatMap((n) => n.stavke);
  return (
    <section aria-label="Otvoreni račun" className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">
        Račun {racun.broj} · {racun.konobar}
      </h2>
      {racun.narudzbe.map((n) => (
        <div key={n.id} className="rounded-lg border-2 border-okvir p-3">
          <p className="font-semibold">
            {nazivStanice[n.stanica] ?? n.stanica} · {n.status}
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {n.stavke
              .filter((s) => s.prilogUz === null)
              .map((s) => (
                <li key={s.id}>
                  <div className="flex justify-between gap-2">
                    <span>
                      {s.kolicina.toString().replace(".", ",")} {s.jedinica} {s.naziv}
                    </span>
                    <span>{formatKM(s.iznos)}</span>
                  </div>
                  {s.napomena && <p className="pl-4 italic">{s.napomena}</p>}
                  {n.stavke
                    .filter((p) => p.prilogUz === s.id)
                    .map((p) => (
                      <Prilog key={p.id} p={p} />
                    ))}
                </li>
              ))}
            {/* A grill dish's fries come from the kitchen, so the side sits on another station's order. */}
            {n.stavke
              .filter((p) => p.prilogUz !== null && !n.stavke.some((s) => s.id === p.prilogUz))
              .map((p) => (
                <li key={p.id}>
                  <Prilog p={p} uz={sve.find((s) => s.id === p.prilogUz)?.naziv} />
                </li>
              ))}
          </ul>
        </div>
      ))}
      <p className="text-xl font-bold">Ukupno: {formatKM(racun.ukupno)}</p>
    </section>
  );
}
