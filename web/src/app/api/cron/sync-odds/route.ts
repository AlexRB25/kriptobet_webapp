import { DEFAULT_SPORTS, configuredSports, fetchOdds, oddsConfigured, toSyncEvent } from "@/lib/odds";
import { adminClient, cronOrAdmin, fail, json, serverConfigured } from "@/lib/server";

/**
 * Refreshes events and odds of every configured league. Called by Vercel Cron (vercel.json)
 * and by the "Actualizar cuotas" button of /admin. Each league costs 2 credits of The Odds API.
 */
export async function GET(request: Request) {
  if (!serverConfigured()) return fail("not_configured", 503);
  if (!(await cronOrAdmin(request))) return fail("forbidden", 401);
  if (!oddsConfigured()) return fail("not_configured", 503);

  const db = adminClient();
  const margin = Math.min(0.5, Math.max(0, Number(process.env.ODDS_MARGIN) || 0));
  const results: Record<string, number | string> = {};

  for (const [index, sport] of configuredSports().entries()) {
    try {
      const feed = await fetchOdds(sport);
      const meta = DEFAULT_SPORTS[sport] ?? { title: feed[0]?.sport_title ?? sport, group: "" };
      const saved = await db.from("sports").upsert({ key: sport, title: meta.title, group_name: meta.group, sort: index });
      if (saved.error) throw new Error(saved.error.message);
      const { data, error } = await db.rpc("sync_odds", { p_sport: sport, p_events: feed.map((event) => toSyncEvent(event, margin)) });
      if (error) throw new Error(error.message);
      results[sport] = data as number;
    } catch (error) {
      // One league failing (out of season, quota) must not stop the others.
      console.error(`No se pudieron actualizar las cuotas de ${sport}:`, error);
      results[sport] = error instanceof Error ? error.message : "error";
    }
  }
  return json({ results });
}
