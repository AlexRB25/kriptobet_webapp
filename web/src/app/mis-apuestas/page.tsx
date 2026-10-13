"use client";

import { useEffect, useState } from "react";
import { RequireSession } from "@/components/require-session";
import { useAccount } from "@/lib/account";
import { dateTime, kickoff, money, odds, usdt } from "@/lib/format";
import { GAMES, type GameId } from "@/lib/games/types";
import { supabase } from "@/lib/supabase";
import { BET_STATUS_LABELS, MARKET_LABELS, pickLabel, type Bet, type BetStatus, type GameRound } from "@/lib/types";

const STATUS_COLORS: Record<BetStatus, string> = { pending: "text-gold", won: "text-brand", lost: "text-muted", void: "text-white" };

function BetCard({ bet }: { bet: Bet }) {
  return (
    <article className="card flex flex-col gap-2">
      <header className="flex items-center justify-between text-sm">
        <span className="text-muted">
          {bet.bet_selections.length > 1 ? `Combinada de ${bet.bet_selections.length}` : "Simple"} · {dateTime(bet.created_at)}
        </span>
        <b className={STATUS_COLORS[bet.status]}>{BET_STATUS_LABELS[bet.status]}</b>
      </header>
      <ul className="flex flex-col gap-1.5">
        {bet.bet_selections.map((selection) => (
          <li key={selection.id} className="flex items-start justify-between gap-3 rounded-lg bg-raised px-3 py-2 text-sm">
            <span className="min-w-0">
              <b>
                {MARKET_LABELS[selection.market]} · {pickLabel(selection)}
              </b>
              <span className="block truncate text-xs text-muted">
                {selection.home_team} vs {selection.away_team} · {kickoff(selection.commence_time)}
              </span>
            </span>
            <span className="tabular shrink-0 text-right">
              {odds(Number(selection.price))}
              {bet.bet_selections.length > 1 && selection.status !== "pending" && (
                <span className={`block text-xs ${STATUS_COLORS[selection.status]}`}>{BET_STATUS_LABELS[selection.status]}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <footer className="tabular flex justify-between text-sm">
        <span className="text-muted">
          Apostado {usdt(Number(bet.stake))} · cuota {odds(Number(bet.total_odds))}
        </span>
        {bet.status === "pending" ? (
          <span>
            Posible premio <b>{usdt(Number(bet.potential_payout))}</b>
          </span>
        ) : (
          <b className={Number(bet.payout) > 0 ? "text-brand" : "text-muted"}>
            {bet.status === "void" ? "Devuelto" : "Cobrado"} {usdt(Number(bet.payout))}
          </b>
        )}
      </footer>
    </article>
  );
}

function History() {
  const { session, balance } = useAccount();
  const [tab, setTab] = useState<"deportes" | "casino">("deportes");
  const [bets, setBets] = useState<Bet[] | null>(null);
  const [rounds, setRounds] = useState<GameRound[] | null>(null);
  const userId = session?.user.id;

  // The balance changes with every bet, round and settlement, so it doubles as the reload signal.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase()
      .from("bets")
      .select("*, bet_selections(*)")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => !cancelled && setBets((data as Bet[]) ?? []));
    supabase()
      .from("game_rounds")
      .select("id, game, bet, payout, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => !cancelled && setRounds((data as GameRound[]) ?? []));
    return () => {
      cancelled = true;
    };
  }, [userId, balance]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1>Mis apuestas</h1>
      <div className="flex gap-2">
        <button type="button" className={`chip ${tab === "deportes" ? "chip-on" : ""}`} onClick={() => setTab("deportes")}>
          Deportes
        </button>
        <button type="button" className={`chip ${tab === "casino" ? "chip-on" : ""}`} onClick={() => setTab("casino")}>
          Casino
        </button>
      </div>

      {tab === "deportes" &&
        (bets === null ? (
          <p className="text-sm text-muted">Cargando…</p>
        ) : bets.length === 0 ? (
          <p className="text-sm text-muted">Todavía no has hecho apuestas deportivas.</p>
        ) : (
          bets.map((bet) => <BetCard key={bet.id} bet={bet} />)
        ))}

      {tab === "casino" &&
        (rounds === null ? (
          <p className="text-sm text-muted">Cargando…</p>
        ) : rounds.length === 0 ? (
          <p className="text-sm text-muted">Todavía no has jugado en el casino.</p>
        ) : (
          <section className="card flex flex-col">
            {rounds.map((round) => {
              const net = Number(round.payout) - Number(round.bet);
              const game = GAMES[round.game as GameId];
              return (
                <div key={round.id} className="flex items-center justify-between gap-3 border-b border-line py-2 text-sm last:border-0">
                  <span>
                    {game?.emoji} {game?.title ?? round.game}
                    <span className="block text-xs text-muted">{dateTime(round.created_at)}</span>
                  </span>
                  <span className="tabular text-right">
                    {round.status === "open" ? (
                      <b className="text-gold">En curso</b>
                    ) : (
                      <b className={net > 0 ? "text-brand" : net < 0 ? "text-muted" : ""}>
                        {net >= 0 ? "+" : "−"}
                        {money(Math.abs(net))}
                      </b>
                    )}
                    <span className="block text-xs text-muted">Apuesta {money(Number(round.bet))}</span>
                  </span>
                </div>
              );
            })}
          </section>
        ))}
    </div>
  );
}

export default function HistoryPage() {
  return (
    <RequireSession>
      <History />
    </RequireSession>
  );
}
