import MeniAdmin from "@/components/sefica/MeniAdmin";

export const metadata = { title: "Uređivanje menija – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Uređivanje menija</h1>
      <MeniAdmin />
    </>
  );
}
