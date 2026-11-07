import Izvjestaji from "@/components/sefica/Izvjestaji";

export const metadata = { title: "Izvještaji – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Izvještaji</h1>
      <Izvjestaji />
    </>
  );
}
