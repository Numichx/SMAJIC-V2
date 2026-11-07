import Link from "next/link";

const uloge = [
  { href: "/konobar", naziv: "Konobar" },
  { href: "/kuhinja", naziv: "Kuhinja" },
  { href: "/pecenjara", naziv: "Pečenjara" },
  { href: "/sank", naziv: "Šank" },
  { href: "/mesnica", naziv: "Mesnica" },
  { href: "/sefica", naziv: "Šefica" },
];

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <h1 className="font-broj text-broj-xl font-extrabold">Smajić</h1>
      <nav aria-label="Uloge" className="grid gap-4 md:grid-cols-2">
        {uloge.map((u) => (
          <Link key={u.href} href={u.href} className="btn btn-outline min-h-20 border-dim text-h3 font-bold">
            {u.naziv}
          </Link>
        ))}
      </nav>
    </main>
  );
}
