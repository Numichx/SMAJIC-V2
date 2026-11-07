import Dnevnik from "@/components/sefica/Dnevnik";

export const metadata = { title: "Dnevnik radnji – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Dnevnik radnji</h1>
      <Dnevnik />
    </>
  );
}
