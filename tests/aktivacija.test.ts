import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { demoBaza, demoRpc } from "@/lib/demo/store";
import { ocisti, osoblje, pripremiOkruzenje } from "./pomocnici";

beforeAll(async () => {
  pripremiOkruzenje();
  await ocisti();
}, 60_000);
afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// PGlite has one connection, so requests cannot really race here. This pins what makes the code single-use on Postgres.
it("holds a shared lock around the activation code check until it commits", async () => {
  const ljudi = await osoblje();
  const kod = (await demoRpc("aktiviraj_pin", { p_zaposlenik: ljudi.konobar.id, p_sefica: ljudi.sefica.id })) as string;
  const brave = await (await demoBaza()).transaction(async (tx) => {
    await tx.query("select * from public.postavi_pin_kodom($1, '4827', 'u-brava', 'i-brava')", [kod]);
    return (await tx.query<{ objid: string }>("select objid from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()")).rows;
  });
  // The device lock, the IP lock, and the one every activation shares.
  expect(brave).toHaveLength(3);
});
