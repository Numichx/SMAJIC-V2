import ZIzvjestaj from "@/components/sefica/ZIzvjestaj";
import { danasUSarajevu } from "@/components/sefica/zIzvjestajPomocno";

export const metadata = { title: "Z-izvještaj – Smajić" };

export default function Page() {
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Z-izvještaj</h1>
      <ZIzvjestaj danas={danasUSarajevu()} />
    </>
  );
}
