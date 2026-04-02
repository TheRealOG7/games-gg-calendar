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
// GAM3S.GG Strapi v5 CMS — fetch all game slugs to gate the "View on GAMES.GG" button
const GAMES_GG_CMS = process.env.GAMES_GG_CMS_URL ?? "https://cms.games.gg";
const CMS_PAGE_SIZE = 200;

// Normalize a CMS/game name to a slug-like token for fuzzy matching
function cmNorm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function fetchCmsPage(page: number): Promise<{ entries: { slug: string; name: string }[]; pageCount: number }> {
  try {
    const res = await fetch(
      `${GAMES_GG_CMS}/api/games?fields[0]=slug&fields[1]=name&pagination[pageSize]=${CMS_PAGE_SIZE}&pagination[page]=${page}`,
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return { entries: [], pageCount: 1 };
    const data = await res.json();
    const entries = ((data.data ?? []) as Array<{ slug?: string; name?: string }>)
      .filter((i) => i.slug)
      .map((i) => ({ slug: i.slug!, name: i.name ?? "" }));
    const pageCount = (data.meta?.pagination?.pageCount as number) ?? 1;
    return { entries, pageCount };
  } catch {
    return { entries: [], pageCount: 1 };
  }
}

// Returns a lookup map: token (exact cms slug or normalised name) → canonical CMS slug
// This lets us both detect featured games AND generate the correct games.gg URL
async function fetchFeaturedSlugMap(): Promise<Record<string, string>> {
  const first = await fetchCmsPage(1);
  if (first.entries.length === 0) return {};
  const all = [...first.entries];
  if (first.pageCount > 1) {
    const rest = await Promise.all(
      Array.from({ length: first.pageCount - 1 }, (_, i) => fetchCmsPage(i + 2))
    );
    for (const page of rest) all.push(...page.entries);
  }
  const map: Record<string, string> = {};
  for (const e of all) {
    map[e.slug] = e.slug;                  // exact slug → cms slug
    if (e.name) map[cmNorm(e.name)] = e.slug; // normalised name → cms slug
  }
  return map;
}

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
  const [rawgAndHardcoded, dashboardReleases, igdbReleases, featuredSlugMap] = await Promise.all([
    fetchAllReleases(startStr, endStr, RAWG_API_KEY),
    fetchDashboardReleases(DASHBOARD_URL),
    fetchIgdbReleases(TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET),
    fetchFeaturedSlugMap(),
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

  // Layer 2: RAWG — overrides with richer metadata (ratings, genres) but keep IGDB cover/description if RAWG has none
  for (const r of rawgAndHardcoded) {
    if (r.released >= startStr && r.released <= endStr) {
      const existing = bySlug.get(r.slug);
      bySlug.set(r.slug, {
        ...r,
        background_image: r.background_image ?? existing?.background_image ?? null,
        platforms: r.platforms.length > 0 ? r.platforms : (existing?.platforms ?? []),
        description: existing?.description ?? r.description ?? null,
      });
    }
  }

  // Layer 3: dashboard cache — fills in anything not covered by live sources
  for (const r of dashboardReleases) {
    if (r.released >= startStr && r.released <= endStr && !bySlug.has(r.slug)) {
      bySlug.set(r.slug, r);
    }
  }

  // Games to exclude entirely (no image + not worth showing)
  const BLACKLISTED_SLUGS = new Set(["all-will-fall"]);

  // Known slug aliases: maps a variant slug → canonical slug so dedup can merge them
  // e.g. RAWG calls it "mouse-pi-for-hire", IGDB calls it "mouse"
  const SLUG_ALIASES: Record<string, string> = {
    "mouse-pi-for-hire": "mouse",
    "mouse-p-i-for-hire": "mouse",
  };
  for (const [variant, canon] of Object.entries(SLUG_ALIASES)) {
    const variantEntry = bySlug.get(variant);
    if (!variantEntry) continue;
    const canonEntry = bySlug.get(canon);
    bySlug.set(
      canon,
      canonEntry
        ? mergeEntries(canonEntry, { ...variantEntry, slug: canon })
        : { ...variantEntry, slug: canon }
    );
    bySlug.delete(variant);
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

  // Merge helper — keep best image, most platforms, description
  function mergeEntries(a: GameRelease, b: GameRelease): GameRelease {
    const base = a.background_image ? a : (b.background_image ? b : a);
    return {
      ...base,
      // prefer earlier release date as authoritative
      released: a.released <= b.released ? a.released : b.released,
      background_image: a.background_image ?? b.background_image,
      platforms: [...new Set([...a.platforms, ...b.platforms])],
      genres: a.genres.length >= b.genres.length ? a.genres : b.genres,
      description: a.description ?? b.description ?? null,
    };
  }

  // Pass 1: exact date + normalized name
  const byName = new Map<string, GameRelease>();
  for (const r of bySlug.values()) {
    const key = `${r.released}::${normalizeName(r.name)}`;
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, r);
    } else {
      byName.set(key, mergeEntries(existing, r));
    }
  }

  // Pass 2: cross-date fuzzy — same normalized name within 7 days → same game from different sources
  const sorted = [...byName.values()].sort((a, b) => a.released.localeCompare(b.released));
  const final: GameRelease[] = [];
  for (const r of sorted) {
    const normR = normalizeName(r.name);
    const match = final.findIndex((e) => {
      if (normalizeName(e.name) !== normR) return false;
      const diff = Math.abs(new Date(r.released).getTime() - new Date(e.released).getTime()) / 86400000;
      return diff <= 14;
    });
    if (match === -1) {
      final.push(r);
    } else {
      final[match] = mergeEntries(final[match], r);
    }
  }

  const releases = final
    .filter((r) => !BLACKLISTED_SLUGS.has(r.slug))
    .sort((a, b) => a.released.localeCompare(b.released));

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
        featuredSlugMap={featuredSlugMap}
      />
    </main>
  );
}
