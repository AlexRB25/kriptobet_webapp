"use client";

import { useEffect, useState } from "react";
import { useAccount } from "@/lib/account";
import { api } from "@/lib/api";
import type { BlackjackOutcome, BlackjackState, Card } from "@/lib/games/types";
import { BetInput, GameFrame, Outcome, PlayButton, useBet, usePlay } from "./shell";

const OUTCOME_TEXT: Record<BlackjackOutcome, string> = {
  blackjack: "¡Blackjack!",
  win: "¡Ganaste!",
  push: "Empate",
  lose: "Gana la casa",
};
type Round = { state: BlackjackState; bet: number; payout: number };

function PlayingCard({ card }: { card?: Card }) {
  if (!card) {
    return <span className="flex h-24 w-16 items-center justify-center rounded-lg border-2 border-white/20 bg-brand-deep text-2xl">🂠</span>;
  }
  const red = card.suit === "♥" || card.suit === "♦";
  return (
    <span className={`pop flex h-24 w-16 flex-col justify-between rounded-lg bg-white p-1.5 text-lg leading-none font-bold ${red ? "text-red" : "text-ink"}`}>
      <span>{card.rank}</span>
      <span className="self-center text-3xl">{card.suit}</span>
    </span>
  );
}

function Hand({ title, cards, total, hidden }: { title: string; cards: Card[]; total: number; hidden?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-sm text-muted">
        {title} <b className="tabular ml-1 rounded bg-raised px-2 py-0.5 text-white">{cards.length ? total : "–"}</b>
      </p>
      <div className="flex min-h-24 gap-2">
        {cards.map((card, index) => (
          <PlayingCard key={index} card={card} />
        ))}
        {hidden && <PlayingCard />}
      </div>
    </div>
  );
}

export function Blackjack() {
  const bet = useBet();
  const { session, balance } = useAccount();
  const { busy, error, send } = usePlay<BlackjackState>("blackjack");
  const [round, setRound] = useState<Round | null>(null);

  // A hand left open (reload, another device) is picked up where it was.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    api<{ round: { bet: number; state: BlackjackState } | null }>("/api/games/blackjack")
      .then((data) => {
        if (!cancelled && data.round) setRound({ state: data.round.state, bet: data.round.bet, payout: 0 });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function move(body: object) {
    const response = await send(body);
    if (response) setRound({ state: response.state, bet: response.bet ?? round?.bet ?? 0, payout: response.payout });
  }

  const state = round?.state;
  const playing = Boolean(state && !state.outcome);

  return (
    <GameFrame
      game="blackjack"
      error={error}
      rules="Gana quien se acerque más a 21 sin pasarse. El blackjack (as + figura o 10) paga 3 a 2. El crupier pide hasta 17 y se planta. Puedes doblar con tus dos primeras cartas: duplicas la apuesta y recibes una sola carta más. No hay división de pares ni seguro."
      controls={
        playing && round ? (
          <>
            <p className="tabular text-sm text-muted">
              Apuesta: <b className="text-white">{round.bet.toFixed(2)} USDT</b>
            </p>
            <PlayButton label="Pedir carta" onClick={() => move({ action: "hit" })} busy={busy} />
            <PlayButton gold label="Plantarse" onClick={() => move({ action: "stand" })} busy={busy} />
            <button type="button" className="btn btn-lg" disabled={busy || !state?.canDouble || balance < round.bet} onClick={() => move({ action: "double" })}>
              Doblar (+{round.bet.toFixed(2)})
            </button>
          </>
        ) : (
          <>
            <BetInput bet={bet} disabled={busy} />
            {bet.problem && <p className="text-xs text-gold">{bet.problem}</p>}
            <PlayButton label="Repartir" onClick={() => move({ action: "deal", bet: bet.amount })} busy={busy} disabled={!bet.amount} />
          </>
        )
      }>
      <Hand title="Crupier" cards={state?.dealer ?? []} total={state?.dealerTotal ?? 0} hidden={playing} />
      <div className="h-14 text-center">
        {round && state?.outcome ? (
          <>
            <p className={`text-xl font-black ${state.outcome === "lose" ? "text-bad" : state.outcome === "push" ? "text-white" : "text-brand"}`}>
              {OUTCOME_TEXT[state.outcome]}
            </p>
            <Outcome payout={round.payout} bet={round.bet} />
          </>
        ) : (
          <p className="pt-4 text-sm text-muted">{playing ? "¿Pides o te plantas?" : "Haz tu apuesta y reparte."}</p>
        )}
      </div>
      <Hand title="Tú" cards={state?.player ?? []} total={state?.playerTotal ?? 0} />
    </GameFrame>
  );
}
