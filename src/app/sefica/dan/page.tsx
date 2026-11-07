import ZatvaranjeDana from "@/components/sefica/ZatvaranjeDana";

export const metadata = { title: "Zatvaranje dana – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Zatvaranje dana</h1>
      <ZatvaranjeDana />
    </>
  );
}
