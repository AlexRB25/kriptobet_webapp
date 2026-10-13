// Reads odds and final scores from The Odds API (https://the-odds-api.com) and turns them into
// the rows that `sync_odds` and `settle_event` of supabase/schema.sql expect. Server only.

/** Leagues offered when ODDS_SPORTS is not set. Keys are The Odds API sport keys. */
export const DEFAULT_SPORTS: Record<string, { title: string; group: string }> = {
  soccer_mexico_ligamx: { title: "Liga MX", group: "Fútbol" },
  soccer_uefa_champs_league: { title: "Champions League", group: "Fútbol" },
  soccer_epl: { title: "Premier League", group: "Fútbol" },
  soccer_spain_la_liga: { title: "LaLiga", group: "Fútbol" },
  americanfootball_nfl: { title: "NFL", group: "Fútbol americano" },
  basketball_nba: { title: "NBA", group: "Básquetbol" },
  baseball_mlb: { title: "MLB", group: "Béisbol" },
  icehockey_nhl: { title: "NHL", group: "Hockey" },
};

export function configuredSports(): string[] {
  const list = (process.env.ODDS_SPORTS ?? "").split(",").map((key) => key.trim()).filter(Boolean);
  return list.length ? list : Object.keys(DEFAULT_SPORTS);
}

type FeedOutcome = { name: string; price: number; point?: number };
export type FeedEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: { key: string; markets: { key: string; outcomes: FeedOutcome[] }[] }[];
};
export type FeedScore = {
  id: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: { name: string; score: string }[] | null;
};

export type SyncOdd = { market: "h2h" | "totals"; outcome: "home" | "draw" | "away" | "over" | "under"; point: number | null; price: number };
export type SyncEvent = { id: string; home_team: string; away_team: string; commence_time: string; odds: SyncOdd[] };

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Our price for an outcome: the median of the bookmakers', minus an optional extra house margin on the winnings. */
function price(values: number[], margin: number) {
  const value = 1 + (median(values) - 1) * (1 - margin);
  return Math.min(500, Math.max(1.01, Math.round(value * 100) / 100));
}

/**
 * Collapses the bookmakers of one event into a single price per outcome.
 * A market is only offered when every side of it has a price, so nobody can be left betting
 * on a market with a missing outcome.
 */
export function toSyncEvent(event: FeedEvent, margin = 0): SyncEvent {
  const h2h: Record<"home" | "draw" | "away", number[]> = { home: [], draw: [], away: [] };
  // Totals lines differ between bookmakers: prices are grouped by line and the most quoted line wins.
  const totals = new Map<number, { over: number[]; under: number[] }>();
  let h2hBooks = 0;

  for (const bookmaker of event.bookmakers ?? []) {
    for (const market of bookmaker.markets) {
      if (market.key === "h2h") {
        h2hBooks++;
        for (const outcome of market.outcomes) {
          if (!(outcome.price > 1)) continue;
          if (outcome.name === event.home_team) h2h.home.push(outcome.price);
          else if (outcome.name === event.away_team) h2h.away.push(outcome.price);
          else if (outcome.name === "Draw") h2h.draw.push(outcome.price);
        }
      } else if (market.key === "totals") {
        for (const outcome of market.outcomes) {
          if (!(outcome.price > 1) || typeof outcome.point !== "number") continue;
          const line = totals.get(outcome.point) ?? { over: [], under: [] };
          if (outcome.name === "Over") line.over.push(outcome.price);
          else if (outcome.name === "Under") line.under.push(outcome.price);
          totals.set(outcome.point, line);
        }
      }
    }
  }

  const odds: SyncOdd[] = [];
  // A draw price quoted by only a few bookmakers means the sport has no draw market, not a three-way one.
  const hasDraw = h2h.draw.length * 2 > h2hBooks;
  if (h2h.home.length && h2h.away.length) {
    odds.push({ market: "h2h", outcome: "home", point: null, price: price(h2h.home, margin) });
    if (hasDraw) odds.push({ market: "h2h", outcome: "draw", point: null, price: price(h2h.draw, margin) });
    odds.push({ market: "h2h", outcome: "away", point: null, price: price(h2h.away, margin) });
  }

  let best: { point: number; over: number[]; under: number[] } | null = null;
  for (const [point, line] of totals) {
    const quotes = Math.min(line.over.length, line.under.length);
    if (quotes > 0 && (!best || quotes > Math.min(best.over.length, best.under.length))) best = { point, ...line };
  }
  if (best) {
    odds.push({ market: "totals", outcome: "over", point: best.point, price: price(best.over, margin) });
    odds.push({ market: "totals", outcome: "under", point: best.point, price: price(best.under, margin) });
  }

  return { id: event.id, home_team: event.home_team, away_team: event.away_team, commence_time: event.commence_time, odds };
}

/** Final score of a finished event, or null while it is not completed or the feed has no usable score. */
export function finalScore(score: FeedScore): { home: number; away: number } | null {
  if (!score.completed || !score.scores) return null;
  const home = score.scores.find((entry) => entry.name === score.home_team);
  const away = score.scores.find((entry) => entry.name === score.away_team);
  if (!home || !away || !/^\d+$/.test(home.score) || !/^\d+$/.test(away.score)) return null;
  return { home: Number(home.score), away: Number(away.score) };
}

export const oddsConfigured = () => Boolean(process.env.ODDS_API_KEY);

async function oddsApi<T>(path: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams({ apiKey: process.env.ODDS_API_KEY ?? "", ...params });
  const response = await fetch(`https://api.the-odds-api.com/v4${path}?${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`The Odds API ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

/** Upcoming and live events of a league with decimal odds. Costs 2 credits of the API quota (2 markets × 1 region). */
export const fetchOdds = (sport: string) =>
  oddsApi<FeedEvent[]>(`/sports/${sport}/odds`, {
    regions: process.env.ODDS_REGIONS || "eu",
    markets: "h2h,totals",
    oddsFormat: "decimal",
  });

/** Scores of the games of the last three days. Costs 2 credits. */
export const fetchScores = (sport: string) => oddsApi<FeedScore[]>(`/sports/${sport}/scores`, { daysFrom: "3" });
