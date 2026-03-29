export const dynamic = "force-dynamic";

import { CalendarClient } from "@/components/CalendarClient";
import { fetchAllReleases } from "@/lib/releases";
import { fetchDashboardReleases } from "@/lib/dashboard";
import type { GameRelease } from "@/lib/releases";

const RAWG_API_KEY = process.env.RAWG_API_KEY ?? "";
const DASHBOARD_URL = process.env.DASHBOARD_URL ?? "";

export default async function CalendarPage() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  // Window: 4 months back, 9 months forward
  const windowStart = new Date(year, month - 5, 1);
  const windowEnd = new Date(year, month + 9, 0);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const startStr = fmt(windowStart);
  const endStr = fmt(windowEnd);

  // Fetch all sources in parallel
  const [rawgAndHardcoded, dashboardReleases] = await Promise.all([
    fetchAllReleases(startStr, endStr, RAWG_API_KEY),
    fetchDashboardReleases(DASHBOARD_URL),
  ]);

  // Merge: dashboard data takes priority, then RAWG, then hardcoded
  // Dashboard data is the most accurate (sourced from IGDB, updated by the scheduler)
  const bySlug = new Map<string, GameRelease>();
  for (const r of rawgAndHardcoded) {
    if (r.released >= startStr && r.released <= endStr) {
      bySlug.set(r.slug, r);
    }
  }
  // Dashboard overrides — filter to window
  for (const r of dashboardReleases) {
    if (r.released >= startStr && r.released <= endStr) {
      // Prefer RAWG image if we already have it for this slug
      const existing = bySlug.get(r.slug);
      bySlug.set(r.slug, {
        ...r,
        background_image: existing?.background_image ?? r.background_image,
        platforms: r.platforms.length > 0 ? r.platforms : (existing?.platforms ?? []),
        genres: r.genres.length > 0 ? r.genres : (existing?.genres ?? []),
      });
    }
  }

  const releases = [...bySlug.values()].sort((a, b) =>
    a.released.localeCompare(b.released)
  );

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
      <div style={{ marginBottom: "14px", flexShrink: 0 }}>
        <h1 style={{ fontSize: "20px", fontWeight: 800, letterSpacing: "-0.02em" }}>
          Gaming Calendar
        </h1>
      </div>

      <CalendarClient
        releases={releases}
        initialYear={year}
        initialMonth={month}
      />
    </main>
  );
}
