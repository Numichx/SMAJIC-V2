import SankPanel from "@/components/stanice/SankPanel";

export const metadata = { title: "Smjena šanka – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Smjena šanka</h1>
      <SankPanel />
    </>
  );
}
