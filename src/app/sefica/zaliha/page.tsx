import ZalihaEkran from "@/components/sefica/ZalihaEkran";

export const metadata = { title: "Zaliha – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Zaliha</h1>
      <ZalihaEkran uloga="sefica" />
    </>
  );
}
