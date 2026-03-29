export const dynamic = "force-dynamic";

import { CalendarClient } from "@/components/CalendarClient";
import { fetchAllReleases } from "@/lib/releases";

const RAWG_API_KEY = process.env.RAWG_API_KEY ?? "";

export default async function CalendarPage() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  // Wide window: 4 months back, 9 months forward for smooth navigation
  const windowStart = new Date(year, month - 5, 1);
  const windowEnd = new Date(year, month + 9, 0);

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const releases = await fetchAllReleases(fmt(windowStart), fmt(windowEnd), RAWG_API_KEY);

  return (
    <main
      style={{
        height: "100dvh",
        maxHeight: "100dvh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        padding: "16px 20px 12px",
        maxWidth: "1100px",
        margin: "0 auto",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "14px", flexShrink: 0 }}>
        <h1 style={{ fontSize: "20px", fontWeight: 800, letterSpacing: "-0.02em" }}>
          Gaming Calendar
        </h1>
        <span style={{ fontSize: "13px", color: "var(--text-dim)" }}>
          Releases, events, and conventions
        </span>
      </div>

      <CalendarClient
        releases={releases}
        initialYear={year}
        initialMonth={month}
      />
    </main>
  );
}
