import SmjeneIstorija from "@/components/sefica/SmjeneIstorija";

export const metadata = { title: "Smjene – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Smjene</h1>
      <SmjeneIstorija />
    </>
  );
}
