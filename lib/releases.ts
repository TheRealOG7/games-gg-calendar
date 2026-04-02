import { HARDCODED_RELEASES } from "./hardcoded-releases";

export interface GameRelease {
  id: number;
  name: string;
  slug: string;
  released: string; // YYYY-MM-DD
  background_image: string | null;
  platforms: string[];
  genres: string[];
  metacritic?: number | null;
  rating?: number;
  ratings_count?: number;
  description?: string | null;
  steamAppId?: string;
}

interface RawgGame {
  id: number;
  name: string;
  slug: string;
  released: string;
  background_image: string | null;
  platforms?: Array<{ platform: { name: string } }>;
  genres?: Array<{ name: string }>;
  metacritic?: number | null;
  rating?: number;
  ratings_count?: number;
}

async function fetchRawgPage(url: string): Promise<RawgGame[]> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results ?? [];
  } catch {
    return [];
  }
}

export async function fetchUpcomingReleases(
  startDate: string,
  endDate: string,
  apiKey: string
): Promise<GameRelease[]> {
  const today = new Date().toISOString().slice(0, 10);

  // Two parallel fetches:
  // 1. Full window (past → future) — catches recent/historical releases
  // 2. Today → endDate — ensures far-future games aren't pushed off by past results
  const fullBase = `https://api.rawg.io/api/games?key=${apiKey}&dates=${startDate},${endDate}&ordering=released&page_size=100&exclude_additions=true`;
  const futureBase = `https://api.rawg.io/api/games?key=${apiKey}&dates=${today},${endDate}&ordering=released&page_size=100&exclude_additions=true`;

  const [page1, page2, futurePage1, futurePage2] = await Promise.all([
    fetchRawgPage(fullBase + "&page=1"),
    fetchRawgPage(fullBase + "&page=2"),
    fetchRawgPage(futureBase + "&page=1"),
    fetchRawgPage(futureBase + "&page=2"),
  ]);

  const rawgResults: GameRelease[] = [...page1, ...page2, ...futurePage1, ...futurePage2].map((g) => ({
    id: g.id,
    name: g.name,
    slug: g.slug,
    released: g.released,
    background_image: g.background_image,
    platforms: [...new Set((g.platforms ?? []).map((p) => normalizePlatform(p.platform.name)))],
    genres: (g.genres ?? []).map((g) => g.name),
    metacritic: g.metacritic,
    rating: g.rating,
    ratings_count: g.ratings_count,
  }));

  // Merge hardcoded releases, RAWG takes precedence if slug matches
  const bySlug = new Map<string, GameRelease>();
  for (const r of HARDCODED_RELEASES) {
    if (r.released >= startDate && r.released <= endDate) {
      bySlug.set(r.slug, r);
    }
  }
  for (const r of rawgResults) {
    // Skip Dec 31 placeholder dates — RAWG uses these for "TBD this year" games
    if (r.released.endsWith("-12-31")) continue;
    bySlug.set(r.slug, r);
  }

  return [...bySlug.values()].sort((a, b) => a.released.localeCompare(b.released));
}

// Fetch descriptions for games missing them — calls individual RAWG endpoint which
// includes description_raw (plain text, Steam-sourced). Batched at concurrency 5.
export async function fetchRawgDescriptions(
  slugs: string[],
  apiKey: string
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!apiKey || slugs.length === 0) return result;

  const BATCH = 5;
  for (let i = 0; i < slugs.length; i += BATCH) {
    const batch = slugs.slice(i, i + BATCH);
    const entries = await Promise.all(
      batch.map(async (slug) => {
        try {
          const res = await fetch(
            `https://api.rawg.io/api/games/${encodeURIComponent(slug)}?key=${apiKey}`,
            { next: { revalidate: 3600 }, signal: AbortSignal.timeout(5000) }
          );
          if (!res.ok) return null;
          const data = await res.json();
          const raw: string = (data.description_raw ?? "").replace(/\r?\n+/g, " ").trim();
          // Skip auto-generated short descriptions (< 80 chars) — RAWG generates these when no real data exists
          if (!raw || raw.length < 80) return null;
          const sentences = raw.split(/\. /).filter((s: string) => s.trim());
          let desc = sentences.slice(0, 3).join(". ").trim();
          if (desc && !/[.!?]$/.test(desc)) desc += ".";
          return desc.length >= 80 ? { slug, desc } : null;
        } catch {
          return null;
        }
      })
    );
    for (const e of entries) {
      if (e) result.set(e.slug, e.desc);
    }
  }
  return result;
}

export async function fetchAllReleases(
  startDate: string,
  endDate: string,
  apiKey: string
): Promise<GameRelease[]> {
  if (apiKey) {
    return fetchUpcomingReleases(startDate, endDate, apiKey);
  }
  // No API key: return only hardcoded releases in range
  return HARDCODED_RELEASES.filter(
    (r) => r.released >= startDate && r.released <= endDate
  ).sort((a, b) => a.released.localeCompare(b.released));
}

function normalizePlatform(name: string): string {
  if (/playstation 5/i.test(name)) return "PS5";
  if (/playstation 4/i.test(name)) return "PS4";
  if (/xbox series/i.test(name)) return "Xbox Series";
  if (/xbox one/i.test(name)) return "Xbox One";
  if (/nintendo switch/i.test(name)) return "Switch";
  if (/pc|windows/i.test(name)) return "PC";
  if (/ios|iphone|ipad/i.test(name)) return "iOS";
  if (/android/i.test(name)) return "Android";
  if (/mac/i.test(name)) return "Mac";
  return name;
}

export function deduplicatePlatforms(platforms: string[]): string[] {
  return [...new Set(platforms)].slice(0, 4);
}

export function getReleasesForDate(releases: GameRelease[], dateStr: string): GameRelease[] {
  return releases.filter((r) => r.released === dateStr);
}

export function gamesGgUrl(slug: string): string {
  return `https://games.gg/${slug}`;
}
