import { PRVA_PRIJAVA, VODIC } from "@/lib/pomoc/vodic";

export const metadata = { title: "Pomoć – Smajić" };

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Pomoć</h1>
      <section aria-labelledby="prva-prijava" className="flex flex-col gap-3">
        <h2 id="prva-prijava" className="text-xl font-semibold">
          Prva prijava
        </h2>
        <ol className="list-decimal space-y-2 pl-6">
          {PRVA_PRIJAVA.map((korak) => (
            <li key={korak}>{korak}</li>
          ))}
        </ol>
      </section>
      {Object.values(VODIC).map((sekcija) => (
        <section key={sekcija.naziv} aria-labelledby={`vodic-${sekcija.naziv}`} className="flex flex-col gap-3">
          <h2 id={`vodic-${sekcija.naziv}`} className="text-xl font-semibold">
            {sekcija.naziv}
          </h2>
          <ol className="list-decimal space-y-2 pl-6">
            {sekcija.koraci.map((korak) => (
              <li key={korak}>{korak}</li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
