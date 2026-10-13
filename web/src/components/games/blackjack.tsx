"use client";

import { useEffect, useState } from "react";
import { useAccount } from "@/lib/account";
import { api } from "@/lib/api";
import type { BlackjackOutcome, BlackjackState, Card } from "@/lib/games/types";
import { outcomeSound, sound } from "@/lib/sound";
import { BetInput, ChipStack, GameFrame, Outcome, PlayButton, useBet, usePlay } from "./shell";

const OUTCOME_TEXT: Record<BlackjackOutcome, string> = {
  blackjack: "¡BLACKJACK!",
  win: "¡GANASTE!",
  push: "EMPATE",
  lose: "GANA LA CASA",
};
type Round = { state: BlackjackState; bet: number; payout: number };

function PlayingCard({ card, index }: { card?: Card; index: number }) {
  const lean = { marginLeft: index === 0 ? 0 : -22, animationDelay: `${Math.min(index, 3) * 90}ms` };
  if (!card) {
    return (
      <span
        style={{ ...lean, background: "repeating-linear-gradient(45deg, #9b1c2c 0 6px, #7a1420 6px 12px)" }}
        className="card-deal h-28 w-20 shrink-0 rounded-lg border-4 border-white shadow-[0_4px_10px_rgb(0_0_0/0.5)]"
      />
    );
  }
  const red = card.suit === "♥" || card.suit === "♦";
  return (
    <span
      style={lean}
      className={`card-deal relative flex h-28 w-20 shrink-0 items-center justify-center rounded-lg border border-neutral-300 bg-white shadow-[0_4px_10px_rgb(0_0_0/0.5)] ${
        red ? "text-red" : "text-neutral-900"
      }`}>
      <span className="absolute top-1 left-1.5 flex flex-col items-center text-lg leading-none font-black">
        {card.rank}
        <span className="text-base">{card.suit}</span>
      </span>
      <span className="text-5xl">{card.suit}</span>
      <span className="absolute right-1.5 bottom-1 flex rotate-180 flex-col items-center text-lg leading-none font-black">
        {card.rank}
        <span className="text-base">{card.suit}</span>
      </span>
    </span>
  );
}

function Hand({ title, cards, total, hidden }: { title: string; cards: Card[]; total: number; hidden?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex min-h-28 pl-2">
        {cards.map((card, index) => (
          <PlayingCard key={index} card={card} index={index} />
        ))}
        {hidden && <PlayingCard index={cards.length} />}
        {cards.length === 0 && <span className="h-28 w-20 rounded-lg border-2 border-dashed border-white/25" />}
      </div>
      <p className="text-xs font-semibold tracking-widest text-white/70 uppercase">
        {title}
        {cards.length > 0 && <b className="tabular ml-2 rounded-full bg-black/50 px-2.5 py-0.5 text-sm text-white">{total}</b>}
      </p>
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
    if (!response) return;
    const stake = response.bet ?? round?.bet ?? 0;
    setRound({ state: response.state, bet: stake, payout: response.payout });
    sound.card();
    if (response.state.outcome) setTimeout(() => outcomeSound(response.payout, stake), 400);
  }

  const state = round?.state;
  const playing = Boolean(state && !state.outcome);

  return (
    <GameFrame
      game="blackjack"
      error={error}
      stageClassName="felt"
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

      {/* The printed arc of the table, with the result over it when the hand ends. */}
      <div className="relative flex h-24 w-full max-w-md items-center justify-center">
        <svg viewBox="0 0 400 96" className="absolute inset-0 h-full w-full" aria-hidden>
          <path id="bj-arc" d="M20 20 Q200 110 380 20" fill="none" stroke="rgb(255 255 255 / 0.25)" strokeWidth="1.5" />
          <text fill="#f5b83d" fontSize="15" fontWeight="700" letterSpacing="3">
            <textPath href="#bj-arc" startOffset="50%" textAnchor="middle">
              BLACKJACK PAGA 3 A 2
            </textPath>
          </text>
        </svg>
        {round && state?.outcome ? (
          <div className="relative rounded-xl bg-black/65 px-5 py-2 text-center backdrop-blur-sm">
            <p className={`text-xl font-black tracking-wide ${state.outcome === "lose" ? "text-bad" : state.outcome === "push" ? "text-white" : "text-gold"}`}>
              {OUTCOME_TEXT[state.outcome]}
            </p>
            <Outcome payout={round.payout} bet={round.bet} />
          </div>
        ) : (
          <p className="relative pt-12 text-sm text-white/70">{playing ? "¿Pides o te plantas?" : "Haz tu apuesta y reparte"}</p>
        )}
      </div>

      <Hand title="Tú" cards={state?.player ?? []} total={state?.playerTotal ?? 0} />
      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-gold/60">
        {round && <ChipStack amount={round.bet} size={34} />}
      </div>
    </GameFrame>
  );
}
