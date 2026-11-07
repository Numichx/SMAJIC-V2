import ZahtjevMesnici from "@/components/stanice/ZahtjevMesnici";

export const metadata = { title: "Mesnica – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Mesnica</h1>
      <ZahtjevMesnici />
    </>
  );
}
