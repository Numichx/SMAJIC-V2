import { initBotId } from "botid/client/core";

// Every PIN check. A script that skips this page is refused, so it can neither guess PINs
// nor keep the global lockout on for every device, even with a waiter's session cookie.
initBotId({
  protect: [
    { path: "/api/prijava", method: "POST" },
    { path: "/api/pin", method: "POST" },
    { path: "/api/narudzbe", method: "POST" },
    { path: "/api/racuni/*/popust", method: "POST" },
  ],
});
