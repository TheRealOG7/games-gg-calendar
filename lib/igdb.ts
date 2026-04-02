import type { GameRelease } from "./releases";

// Module-level token cache — survives across requests on the same server instance
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Twitch auth failed: ${res.status}`);
  const data = await res.json();
  // Twitch tokens last ~60 days; cache for 50
  cachedToken = { value: data.access_token, expiresAt: Date.now() + 50 * 24 * 3600 * 1000 };
  return cachedToken.value;
}

async function igdbPost(
  endpoint: string,
  body: string,
  clientId: string,
  token: string
): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: "POST",
      headers: {
        "Client-Id": clientId,
        "Authorization": `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
      body,
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

function normalizePlatform(name: string): string {
  if (/playstation 5/i.test(name)) return "PS5";
  if (/playstation 4/i.test(name)) return "PS4";
  if (/xbox series/i.test(name)) return "Xbox Series";
  if (/xbox one/i.test(name)) return "Xbox One";
  if (/nintendo switch 2/i.test(name)) return "Switch 2";
  if (/nintendo switch/i.test(name)) return "Switch";
  if (/pc|windows/i.test(name)) return "PC";
  if (/mac/i.test(name)) return "Mac";
  if (/ios|iphone|ipad/i.test(name)) return "iOS";
  if (/android/i.test(name)) return "Android";
  return name;
}

export async function fetchIgdbReleases(
  clientId: string,
  clientSecret: string
): Promise<GameRelease[]> {
  if (!clientId || !clientSecret) return [];

  let token: string;
  try {
    token = await getAccessToken(clientId, clientSecret);
  } catch {
    return [];
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const futureSec = Math.floor((Date.now() + 270 * 24 * 3600 * 1000) / 1000);

  // Fetch two pages of games in parallel (up to 1000 games)
  const gameQuery = (offset: number) =>
    `fields name,url,hypes,follows,first_release_date,platforms.name,summary,storyline;` +
    ` where first_release_date >= ${nowSec} & first_release_date <= ${futureSec} & hypes >= 10;` +
    ` sort first_release_date asc; limit 500; offset ${offset};`;

  const [gamesPage1, gamesPage2] = await Promise.all([
    igdbPost("games", gameQuery(0), clientId, token),
    igdbPost("games", gameQuery(500), clientId, token),
  ]);

  // Deduplicate by id
  const gamesById = new Map<number, Record<string, unknown>>();
  for (const g of [...gamesPage1, ...gamesPage2]) {
    const id = g.id as number;
    if (!gamesById.has(id)) gamesById.set(id, g);
  }
  const games = [...gamesById.values()];
  if (games.length === 0) return [];

  // Batch IDs into groups of 500 for release_dates and covers queries
  const allIds = games.map((g) => g.id as number);
  const batches: number[][] = [];
  for (let i = 0; i < allIds.length; i += 500) {
    batches.push(allIds.slice(i, i + 500));
  }

  // Fetch release dates and covers for all batches in parallel
  const [rdResults, coverResults] = await Promise.all([
    Promise.all(
      batches.map((batch) =>
        igdbPost(
          "release_dates",
          `fields game,date,date_format,platform.name; where game = (${batch.join(",")}) & date_format = 0; limit 500;`,
          clientId,
          token
        )
      )
    ).then((pages) => pages.flat()),
    Promise.all(
      batches.map((batch) =>
        igdbPost(
          "covers",
          `fields game,image_id; where game = (${batch.join(",")}); limit 500;`,
          clientId,
          token
        )
      )
    ).then((pages) => pages.flat()),
  ]);

  // Build release date map: game id → earliest confirmed date
  const rdMap = new Map<number, { dateStr: string; platforms: string[] }>();
  for (const rd of rdResults) {
    const gid = rd.game as number;
    const ts = rd.date as number;
    if (!gid || !ts) continue;
    const dateStr = new Date(ts * 1000).toISOString().slice(0, 10);
    const existing = rdMap.get(gid);
    const platform = (rd.platform as Record<string, string> | null)?.name ?? "";
    if (!existing) {
      rdMap.set(gid, { dateStr, platforms: platform ? [platform] : [] });
    } else {
      if (dateStr < existing.dateStr) existing.dateStr = dateStr;
      if (platform) existing.platforms.push(platform);
    }
  }

  // Build cover map: game id → image_id
  const coverMap = new Map<number, string>();
  for (const c of coverResults) {
    const gid = c.game as number;
    const imageId = c.image_id as string;
    if (gid && imageId) coverMap.set(gid, imageId);
  }

  // Fetch screenshots as fallback for games without cover art
  const gamesWithoutCoverIds = allIds.filter((id) => !coverMap.has(id));
  const screenshotMap = new Map<number, string>();
  if (gamesWithoutCoverIds.length > 0) {
    const ssBatches: number[][] = [];
    for (let i = 0; i < gamesWithoutCoverIds.length; i += 500) {
      ssBatches.push(gamesWithoutCoverIds.slice(i, i + 500));
    }
    const ssResults = await Promise.all(
      ssBatches.map((batch) =>
        igdbPost(
          "screenshots",
          `fields game,image_id; where game = (${batch.join(",")}); sort id asc; limit 500;`,
          clientId,
          token
        )
      )
    ).then((pages) => pages.flat());
    for (const s of ssResults) {
      const gid = s.game as number;
      const imgId = s.image_id as string;
      if (gid && imgId && !screenshotMap.has(gid)) screenshotMap.set(gid, imgId);
    }
  }

  // Build final GameRelease list
  const results: GameRelease[] = [];
  let idCounter = 700000;
  const seenSlugs = new Set<string>();

  for (const game of games) {
    const gid = game.id as number;
    const rd = rdMap.get(gid);
    if (!rd) continue;

    const url = game.url as string | undefined;
    const slug = url?.replace(/\/$/, "").split("/").pop() ?? "";
    if (!slug || seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);

    const imageId = coverMap.get(gid);
    const ssImageId = !imageId ? screenshotMap.get(gid) : undefined;
    const platforms = (game.platforms as Array<{ name: string }> | null) ?? [];

    results.push({
      id: idCounter++,
      name: game.name as string,
      slug,
      released: rd.dateStr,
      background_image: imageId
        ? `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${imageId}.jpg`
        : ssImageId
        ? `https://images.igdb.com/igdb/image/upload/t_screenshot_big/${ssImageId}.jpg`
        : null,
      platforms: [...new Set(platforms.map((p) => normalizePlatform(p.name)))],
      genres: [],
      description: (game.summary as string | undefined) ?? (game.storyline as string | undefined) ?? null,
    });
  }

  return results.sort((a, b) => a.released.localeCompare(b.released));
}
