export interface GameRelease {
  id: number;
  name: string;
  slug: string;
  released: string; // YYYY-MM-DD
  background_image: string | null;
  platforms: string[];
  genres: string[];
  description_raw?: string;
  metacritic?: number | null;
  rating?: number;
  rating_top?: number;
  ratings_count?: number;
  esrb_rating?: string | null;
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
  rating_top?: number;
  ratings_count?: number;
  esrb_rating?: { name: string } | null;
}

export async function fetchUpcomingReleases(
  startDate: string,
  endDate: string,
  apiKey: string
): Promise<GameRelease[]> {
  const url = `https://api.rawg.io/api/games?key=${apiKey}&dates=${startDate},${endDate}&ordering=released&page_size=80&exclude_additions=true`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 }, // cache 1 hour
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: RawgGame[] = data.results ?? [];

    return results.map((g) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      released: g.released,
      background_image: g.background_image,
      platforms: (g.platforms ?? []).map((p) => normalizePlatform(p.platform.name)),
      genres: (g.genres ?? []).map((g) => g.name),
      metacritic: g.metacritic,
      rating: g.rating,
      rating_top: g.rating_top,
      ratings_count: g.ratings_count,
      esrb_rating: g.esrb_rating?.name ?? null,
    }));
  } catch {
    return [];
  }
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

// Deduplicate platform list (e.g. PS5+PS4 → just show PS5 if both exist, etc.)
export function deduplicatePlatforms(platforms: string[]): string[] {
  const unique = [...new Set(platforms)];
  // If both PS5 and PS4, keep both but deduplicate
  return unique.slice(0, 4); // cap at 4 to keep UI clean
}

export function getReleasesForDate(releases: GameRelease[], dateStr: string): GameRelease[] {
  return releases.filter((r) => r.released === dateStr);
}

export function gamesGgUrl(slug: string): string {
  return `https://games.gg/games/${slug}`;
}
