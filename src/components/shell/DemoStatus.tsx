"use client";

import { useEffect, useState } from "react";

export default function DemoStatus() {
  const [demo, postaviDemo] = useState(false);

  useEffect(() => {
    fetch("/api/status")
      .then((odgovor) => odgovor.json())
      .then((tijelo) => postaviDemo(tijelo?.mod === "demo"))
      .catch(() => {});
  }, []);

  if (!demo) return null;
  return (
    <p role="status" className="w-full bg-base-200 px-4 py-1 text-center text-base">
      Demo način: podaci se čuvaju samo na ovom računaru.
    </p>
  );
}
