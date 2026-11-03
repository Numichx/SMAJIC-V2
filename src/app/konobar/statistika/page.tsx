import StatistikaKonobara from "@/components/konobar/StatistikaKonobara";

export const metadata = { title: "Moja statistika – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Moja statistika</h1>
      <StatistikaKonobara />
    </>
  );
}
