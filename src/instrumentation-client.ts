import { initBotId } from "botid/client/core";

// The PIN checks anyone can reach without a session. A script that skips this page is refused,
// so it can neither guess PINs nor keep the global lockout on for every device.
initBotId({
  protect: [
    { path: "/api/prijava", method: "POST" },
    { path: "/api/pin", method: "POST" },
  ],
});
