import { checkBotId } from "botid/server";
import { ApiGreska } from "@/lib/api/greske";

// Vercel BotID: refuses requests that did not come from the app's page in a real browser.
// Outside production it always answers "human", so tests and `next dev` are unaffected.
// A local `next start` has no Vercel headers, so its logins are refused; use `next dev` or a preview.
export async function zahtijevajCovjeka() {
  const { isBot } = await checkBotId({ developmentOptions: { bypass: "HUMAN" } });
  if (isBot) throw new ApiGreska(403, "Provjera uređaja nije uspjela. Osvježite stranicu i pokušajte ponovo.");
}
