import ZalihaEkran from "@/components/sefica/ZalihaEkran";

export const metadata = { title: "Mesnica – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Mesnica</h1>
      <ZalihaEkran uloga="mesnica" />
    </>
  );
}
