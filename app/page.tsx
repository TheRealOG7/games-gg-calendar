export const dynamic = "force-dynamic";

import { CalendarClient } from "@/components/CalendarClient";
import { fetchAllReleases } from "@/lib/releases";
import { fetchDashboardReleases } from "@/lib/dashboard";
import { fetchIgdbReleases } from "@/lib/igdb";
import type { GameRelease } from "@/lib/releases";

const RAWG_API_KEY = process.env.RAWG_API_KEY ?? "";
const DASHBOARD_URL = process.env.DASHBOARD_URL ?? "";
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID ?? "";
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET ?? "";

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
  const [rawgAndHardcoded, dashboardReleases, igdbReleases] = await Promise.all([
    fetchAllReleases(startStr, endStr, RAWG_API_KEY),
    fetchDashboardReleases(DASHBOARD_URL),
    fetchIgdbReleases(TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET),
  ]);

  // Merge priority: RAWG (has images + metacritic) → IGDB direct → dashboard cache
  // IGDB direct is the authoritative source for dates and cover art
  const bySlug = new Map<string, GameRelease>();

  // Layer 1: IGDB direct (authoritative dates + cover art)
  for (const r of igdbReleases) {
    if (r.released >= startStr && r.released <= endStr) {
      bySlug.set(r.slug, r);
    }
  }

  // Layer 2: RAWG — overrides with richer metadata (ratings, genres) but keep IGDB cover if RAWG has none
  for (const r of rawgAndHardcoded) {
    if (r.released >= startStr && r.released <= endStr) {
      const existing = bySlug.get(r.slug);
      bySlug.set(r.slug, {
        ...r,
        background_image: r.background_image ?? existing?.background_image ?? null,
        platforms: r.platforms.length > 0 ? r.platforms : (existing?.platforms ?? []),
      });
    }
  }

  // Layer 3: dashboard cache — fills in anything not covered by live sources
  for (const r of dashboardReleases) {
    if (r.released >= startStr && r.released <= endStr && !bySlug.has(r.slug)) {
      bySlug.set(r.slug, r);
    }
  }

  // Final dedup by normalized name — catches same game with different slugs across sources
  // e.g. IGDB "mixtape", RAWG "mixtape--1", RAWG "mixtape-2025" → keep best entry
  function normalizeName(name: string): string {
    return name
      .replace(/:\s+.+$/, "")          // strip subtitle after ": " e.g. "Mouse: Pi for Hire" → "Mouse"
      .toLowerCase()
      .replace(/\bzero\b/g, "0").replace(/\bone\b/g, "1").replace(/\btwo\b/g, "2")
      .replace(/\bthree\b/g, "3").replace(/\bfour\b/g, "4").replace(/\bfive\b/g, "5")
      .replace(/\bsix\b/g, "6").replace(/\bseven\b/g, "7").replace(/\beight\b/g, "8")
      .replace(/\bnine\b/g, "9")
      .replace(/\s*\([^)]*\)/g, "")   // strip "(2025)", "(Deluxe)", etc.
      .replace(/[^a-z0-9]/g, "")       // strip punctuation
      .trim();
  }

  const byName = new Map<string, GameRelease>();
  for (const r of bySlug.values()) {
    const key = `${r.released}::${normalizeName(r.name)}`;
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, r);
    } else {
      // Keep the entry with more data: prefer one with image, then more platforms
      const betterImage = !existing.background_image && r.background_image;
      const betterPlatforms = r.platforms.length > existing.platforms.length;
      if (betterImage || (!existing.background_image && betterPlatforms)) {
        byName.set(key, { ...r, background_image: r.background_image ?? existing.background_image });
      }
    }
  }

  const releases = [...byName.values()].sort((a, b) =>
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
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <CalendarClient
        releases={releases}
        initialYear={year}
        initialMonth={month}
      />
    </main>
  );
}
