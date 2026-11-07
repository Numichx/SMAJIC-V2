import StoloviPregled from "@/components/konobar/StoloviPregled";

export const metadata = { title: "Konobar – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Stolovi</h1>
      <StoloviPregled />
    </>
  );
}
