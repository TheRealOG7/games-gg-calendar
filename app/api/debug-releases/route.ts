export const dynamic = "force-dynamic";

import { fetchAllReleases } from "@/lib/releases";
import { fetchIgdbReleases } from "@/lib/igdb";

export async function GET() {
  const RAWG_API_KEY = process.env.RAWG_API_KEY ?? "";
  const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID ?? "";
  const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET ?? "";

  const today = new Date();
  const start = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-01`;
  const end = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-30`;

  const [rawg, igdb] = await Promise.all([
    fetchAllReleases(start, end, RAWG_API_KEY),
    fetchIgdbReleases(TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET),
  ]);

  const mouseRawg = rawg.filter(r => r.name.toLowerCase().includes("mouse") || r.slug.includes("mouse"));
  const mouseIgdb = igdb.filter(r => r.name.toLowerCase().includes("mouse") || r.slug.includes("mouse"));

  return Response.json({
    rawg_mouse: mouseRawg.map(r => ({ slug: r.slug, name: r.name, released: r.released, platforms: r.platforms })),
    igdb_mouse: mouseIgdb.map(r => ({ slug: r.slug, name: r.name, released: r.released, platforms: r.platforms })),
  });
}
