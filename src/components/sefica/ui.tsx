import { polje } from "@/components/konobar/stil";
import type { ReactNode } from "react";

// A wide table scrolls inside its own box, so the page never scrolls sideways.
export function Tabela({
  naslov,
  kolone,
  redovi,
  prazno,
}: {
  naslov: string;
  kolone: string[];
  redovi: ReactNode[][];
  prazno: string;
}) {
  return (
    <section aria-label={naslov} className="flex flex-col gap-2">
      <h3 className="text-lg font-semibold">{naslov}</h3>
      {redovi.length === 0 ? (
        <p>{prazno}</p>
      ) : (
        <div tabIndex={0} role="region" aria-label={`${naslov} (tabela)`} className="overflow-x-auto rounded-lg border-2 border-okvir">
          <table className="w-full min-w-max border-collapse text-left">
            <thead>
              <tr className="bg-povrsina">
                {kolone.map((k, i) => (
                  <th key={k} scope="col" className={`px-3 py-2 ${i > 0 ? "text-right" : ""}`}>
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {redovi.map((red, i) => (
                <tr key={i} className="border-t border-okvir">
                  {red.map((c, j) => (
                    <td key={j} className={`px-3 py-2 ${j > 0 ? "text-right" : ""}`}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function Polje({
  oznaka,
  vrijednost,
  onChange,
  tip = "decimal",
  maxLength,
}: {
  oznaka: string;
  vrijednost: string;
  onChange: (v: string) => void;
  tip?: "decimal" | "numeric" | "text";
  maxLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      {oznaka}
      <input
        className={polje}
        value={vrijednost}
        onChange={(e) => onChange(e.target.value)}
        inputMode={tip}
        maxLength={maxLength}
        autoComplete="off"
      />
    </label>
  );
}

export function Greska({ tekst }: { tekst: string }) {
  return (
    <p role="alert" className="font-semibold text-greska">
      {tekst}
    </p>
  );
}

export function Podaci({ stavke }: { stavke: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4">
      {stavke.map(([k, v]) => (
        <div key={k} className="col-span-2 grid grid-cols-subgrid border-b border-okvir py-1">
          <dt>{k}</dt>
          <dd className="text-right font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
