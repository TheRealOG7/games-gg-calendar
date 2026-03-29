export const dynamic = "force-dynamic";

import { CalendarClient } from "@/components/CalendarClient";
import { fetchUpcomingReleases } from "@/lib/releases";

const RAWG_API_KEY = process.env.RAWG_API_KEY ?? "";

export default async function CalendarPage() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  // Fetch a wide window: 3 months back, 9 months forward
  // So navigation feels instant for nearby months
  const windowStart = new Date(year, month - 4, 1);
  const windowEnd = new Date(year, month + 8, 0); // last day of +8 months

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const releases = RAWG_API_KEY
    ? await fetchUpcomingReleases(fmt(windowStart), fmt(windowEnd), RAWG_API_KEY)
    : [];

  return (
    <main style={{ maxWidth: "900px", margin: "0 auto", padding: "24px 16px 60px" }}>
      {/* Page header */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
          <span style={{ fontSize: "22px" }}>🗓</span>
          <h1 style={{ fontSize: "24px", fontWeight: 800, letterSpacing: "-0.02em" }}>
            Gaming Calendar
          </h1>
        </div>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
          Upcoming game releases, events, and conventions — all in one place.
        </p>
      </div>

      <CalendarClient
        releases={releases}
        initialYear={year}
        initialMonth={month}
      />

      {/* Footer note */}
      <p
        style={{
          textAlign: "center",
          fontSize: "12px",
          color: "var(--text-dim)",
          marginTop: "32px",
        }}
      >
        Release dates from RAWG.io · Events curated by GAMES.GG
      </p>
    </main>
  );
}
