import type { GameRelease } from "./releases";

interface DashboardReleasingGame {
  name: string;
  date: string; // e.g. "Mar 13, 2026" or "Apr 02, 2026"
  platforms: string; // e.g. "PS5 · PC · Switch 2 · XSX"
  hypes: number;
  follows?: number;
  igdb_url: string;
  cover_url?: string | null;
}

interface DashboardWishlistedGame {
  name: string;
  steam_url?: string;
  igdb_url?: string;
  release_date: string; // e.g. "May 19" or "TBA" or "Aug 15"
}

interface GamingTrendsData {
  releasing?: DashboardReleasingGame[];
  wishlisted?: DashboardWishlistedGame[];
}

// gaming_releases.json — wider 270-day window, same releasing shape
interface GamingReleasesData {
  updated: string;
  window_days: number;
  count: number;
  releasing: DashboardReleasingGame[];
}

function parseIgdbSlug(igdbUrl: string): string {
  return igdbUrl.replace(/\/$/, "").split("/").pop() ?? "";
}

function parsePlatforms(str: string): string[] {
  return str
    .split("·")
    .map((s) => s.trim())
    .map(normalizePlatform)
    .filter(Boolean);
}

function normalizePlatform(name: string): string {
  switch (name) {
    case "XSX": return "Xbox Series";
    case "XB1": return "Xbox One";
    case "PS5": return "PS5";
    case "PS4": return "PS4";
    case "Switch 2": return "Switch 2";
    case "Switch": return "Switch";
    case "PC": return "PC";
    case "Mac": return "Mac";
    case "iOS": return "iOS";
    case "Android": return "Android";
    default: return name;
  }
}

// Parse "Mar 13, 2026" → "2026-03-13"
function parseDateStr(dateStr: string): string | null {
  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  // Full date: "Mar 13, 2026"
  const full = dateStr.match(/^(\w{3})\s+(\d{1,2}),\s+(\d{4})$/);
  if (full) {
    const m = months[full[1]];
    if (!m) return null;
    return `${full[3]}-${m}-${String(full[2]).padStart(2, "0")}`;
  }
  // Short date with no year: "May 19" — assume current or next year
  const short = dateStr.match(/^(\w{3})\s+(\d{1,2})$/);
  if (short) {
    const m = months[short[1]];
    if (!m) return null;
    const today = new Date();
    const year = today.getFullYear();
    const candidate = `${year}-${m}-${String(short[2]).padStart(2, "0")}`;
    // If the date is in the past, push to next year
    return candidate < today.toISOString().slice(0, 10)
      ? `${year + 1}-${m}-${String(short[2]).padStart(2, "0")}`
      : candidate;
  }
  return null;
}

// Minimum hype threshold for gaming_trends.json (daily 60-day window, noisier)
// gaming_releases.json already pre-filters with hypes >= 1 at fetch time
const MIN_HYPES_TRENDS = 5;
const MIN_HYPES_RELEASES = 1;

function parseReleasingList(
  releasing: DashboardReleasingGame[],
  idStart: number,
  seenSlugs: Set<string>,
  minHypes = MIN_HYPES_TRENDS,
): GameRelease[] {
  const results: GameRelease[] = [];
  let id = idStart;
  for (const g of releasing) {
    if ((g.hypes ?? 0) < minHypes) continue;
    const released = parseDateStr(g.date);
    if (!released) continue;
    const slug = parseIgdbSlug(g.igdb_url);
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    results.push({
      id: id++,
      name: g.name,
      slug,
      released,
      background_image: g.cover_url ?? null,
      platforms: parsePlatforms(g.platforms),
      genres: [],
    });
  }
  return results;
}

export async function fetchDashboardReleases(dashboardUrl: string): Promise<GameRelease[]> {
  if (!dashboardUrl) return [];

  const results: GameRelease[] = [];
  const seenSlugs = new Set<string>();
  let idCounter = 800000;

  // 1. Try gaming_releases.json first (270-day window, updated on-demand)
  try {
    const res = await fetch(`${dashboardUrl}/public/gaming_releases.json`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data: GamingReleasesData = await res.json();
      const parsed = parseReleasingList(data.releasing ?? [], idCounter, seenSlugs, MIN_HYPES_RELEASES);
      results.push(...parsed);
      idCounter += parsed.length;
    }
  } catch {
    // fall through to gaming_trends.json
  }

  // 2. Supplement with gaming_trends.json (60-day window, refreshed daily)
  //    Adds any games not already covered by the wider fetch
  try {
    const res = await fetch(`${dashboardUrl}/public/gaming_trends.json`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data: GamingTrendsData = await res.json();

      const parsed = parseReleasingList(data.releasing ?? [], idCounter, seenSlugs);
      results.push(...parsed);
      idCounter += parsed.length;

      // Wishlisted list (short dates, no year — high-interest titles)
      for (const g of data.wishlisted ?? []) {
        if (!g.igdb_url || g.release_date === "TBA") continue;
        const released = parseDateStr(g.release_date);
        if (!released) continue;
        const slug = parseIgdbSlug(g.igdb_url);
        if (seenSlugs.has(slug)) continue;
        seenSlugs.add(slug);
        results.push({
          id: idCounter++,
          name: g.name,
          slug,
          released,
          background_image: null,
          platforms: [],
          genres: [],
        });
      }
    }
  } catch {
    // best effort
  }

  return results;
}
