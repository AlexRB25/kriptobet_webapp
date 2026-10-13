import { fetchScores, finalScore, oddsConfigured } from "@/lib/odds";
import { adminClient, cronOrAdmin, fail, json, serverConfigured } from "@/lib/server";

/** Events are looked up once this long has passed since kick-off. */
const MIN_AGE_MS = 90 * 60_000;

/**
 * Reads final scores and settles the bets of finished events. Called by Vercel Cron and by the
 * "Liquidar apuestas" button of /admin. Only leagues with events waiting for a result are
 * queried (2 credits each). The feed covers the last three days; anything older, or without a
 * score in the feed, is settled by hand from /admin.
 */
export async function GET(request: Request) {
  if (!serverConfigured()) return fail("not_configured", 503);
  if (!(await cronOrAdmin(request))) return fail("forbidden", 401);
  if (!oddsConfigured()) return fail("not_configured", 503);

  const db = adminClient();
  const waiting = await db
    .from("events")
    .select("id, sport_key")
    .eq("status", "upcoming")
    .lt("commence_time", new Date(Date.now() - MIN_AGE_MS).toISOString());
  if (waiting.error) return fail("server_error", 500);

  const bySport = new Map<string, Set<string>>();
  for (const event of waiting.data) {
    if (!bySport.has(event.sport_key)) bySport.set(event.sport_key, new Set());
    bySport.get(event.sport_key)!.add(event.id);
  }

  let events = 0;
  let bets = 0;
  const errors: string[] = [];
  for (const [sport, ids] of bySport) {
    try {
      for (const score of await fetchScores(sport)) {
        const result = ids.has(score.id) ? finalScore(score) : null;
        if (!result) continue;
        const { data, error } = await db.rpc("settle_event", { p_event: score.id, p_home: result.home, p_away: result.away });
        if (error) throw new Error(error.message);
        events++;
        bets += data as number;
      }
    } catch (error) {
      console.error(`No se pudieron liquidar los eventos de ${sport}:`, error);
      errors.push(`${sport}: ${error instanceof Error ? error.message : "error"}`);
    }
  }
  return json({ events, bets, errors });
}
