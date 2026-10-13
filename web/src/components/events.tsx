"use client";

import { useCallback, useEffect, useState } from "react";
import { kickoff, odds as formatOdds } from "@/lib/format";
import { slip, useSlip } from "@/lib/slip";
import { supabase } from "@/lib/supabase";
import { MARKET_LABELS, pickLabel, type Market, type Odd, type Sport, type SportEvent } from "@/lib/types";

const OUTCOME_ORDER = ["home", "draw", "away", "over", "under"];

/** Sports and the events that can still be bet on, refreshed every minute and when the tab regains focus. */
export function useEvents() {
  const [state, setState] = useState<{ sports: Sport[]; events: SportEvent[]; loading: boolean; error: boolean }>({
    sports: [],
    events: [],
    loading: true,
    error: false,
  });

  const load = useCallback(async () => {
    const [sports, events] = await Promise.all([
      supabase().from("sports").select("key, title, group_name, sort").eq("active", true).order("sort"),
      supabase()
        .from("events")
        .select("id, sport_key, home_team, away_team, commence_time, odds(id, event_id, market, outcome, point, price, active)")
        .eq("status", "upcoming")
        .gt("commence_time", new Date().toISOString())
        .order("commence_time")
        .limit(300),
    ]);
    if (sports.error || events.error) return setState((old) => ({ ...old, loading: false, error: true }));
    const open = (events.data as SportEvent[])
      .map((event) => ({ ...event, odds: event.odds.filter((odd) => odd.active) }))
      .filter((event) => event.odds.length > 0);
    setState({ sports: sports.data as Sport[], events: open, loading: false, error: false });
  }, []);

  useEffect(() => {
    Promise.resolve().then(load);
    const timer = setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  return state;
}

function OddsButton({ event, odd, selected }: { event: SportEvent; odd: Odd; selected: boolean }) {
  const label = pickLabel({ ...odd, home_team: event.home_team, away_team: event.away_team });
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() =>
        slip.toggle({
          oddsId: odd.id,
          eventId: event.id,
          price: Number(odd.price),
          eventName: `${event.home_team} vs ${event.away_team}`,
          pick: `${MARKET_LABELS[odd.market]} · ${label}`,
        })
      }
      className={`flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition ${
        selected ? "border-brand bg-brand text-ink" : "border-line bg-raised hover:border-brand"
      }`}>
      <span className={`truncate ${selected ? "" : "text-muted"}`}>{label}</span>
      <span className="tabular font-bold">{formatOdds(Number(odd.price))}</span>
    </button>
  );
}

export function EventCard({ event, sport }: { event: SportEvent; sport?: Sport }) {
  const selections = useSlip();
  const markets: Market[] = ["h2h", "totals"];
  return (
    <article className="card flex flex-col gap-3">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{event.home_team}</p>
          <p className="truncate font-semibold">{event.away_team}</p>
        </div>
        <div className="shrink-0 text-right text-xs text-muted">
          {sport && <p className="font-semibold text-brand">{sport.title}</p>}
          <p>{kickoff(event.commence_time)}</p>
        </div>
      </header>
      {markets.map((market) => {
        const odds = event.odds
          .filter((odd) => odd.market === market)
          .sort((a, b) => OUTCOME_ORDER.indexOf(a.outcome) - OUTCOME_ORDER.indexOf(b.outcome));
        if (odds.length === 0) return null;
        return (
          <div key={market} className="flex gap-2">
            {odds.map((odd) => (
              <OddsButton key={odd.id} event={event} odd={odd} selected={selections.some((item) => item.oddsId === odd.id)} />
            ))}
          </div>
        );
      })}
    </article>
  );
}
