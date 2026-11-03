import ReceptiEkran from "@/components/sefica/ReceptiEkran";

export const metadata = { title: "Recepti i nabavka – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Recepti i nabavka</h1>
      <ReceptiEkran />
    </>
  );
}
