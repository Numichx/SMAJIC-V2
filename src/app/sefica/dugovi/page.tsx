import DugoviGostiju from "@/components/sefica/DugoviGostiju";

export const metadata = { title: "Dugovi gostiju – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Dugovi gostiju</h1>
      <DugoviGostiju />
    </>
  );
}
