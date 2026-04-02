// Fetch short_description from the Steam store API for a list of Steam App IDs.
// Steam appdetails supports multiple appids per request (comma-separated).
export async function fetchSteamDescriptions(
  appIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (appIds.length === 0) return result;

  const BATCH = 50;
  for (let i = 0; i < appIds.length; i += BATCH) {
    const batch = appIds.slice(i, i + BATCH);
    try {
      const res = await fetch(
        `https://store.steampowered.com/api/appdetails?appids=${batch.join(",")}&filters=short_description`,
        { next: { revalidate: 3600 }, signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) continue;
      const data = await res.json() as Record<string, { success: boolean; data?: { short_description?: string } }>;
      for (const appId of batch) {
        const entry = data[appId];
        const desc = entry?.success ? (entry.data?.short_description ?? "") : "";
        if (desc.trim()) result.set(appId, desc.trim());
      }
    } catch {
      // continue with next batch
    }
  }
  return result;
}
