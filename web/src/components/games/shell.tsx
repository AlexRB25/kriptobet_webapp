"use client";

import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { useAccount } from "@/lib/account";
import { api, errorCode } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { money, parseAmount, usdt } from "@/lib/format";
import { GAMES, type GameId, type GameResponse } from "@/lib/games/types";

// Pieces shared by the six game screens.

/** Sends moves to a game's endpoint and keeps the header balance in step with the answers. */
export function usePlay<State>(game: GameId) {
  const { setBalance } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /** `deferBalance` is for games that animate the outcome: they call `setBalance` when the animation ends. */
  const send = useCallback(
    async (body: unknown, deferBalance = false): Promise<GameResponse<State> | null> => {
      setError("");
      setBusy(true);
      try {
        const response = await api<GameResponse<State>>(`/api/games/${game}`, body);
        if (!deferBalance) setBalance(response.balance);
        return response;
      } catch (error) {
        setError(errorMessage(errorCode(error)));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [game, setBalance],
  );

  return { busy, error, send };
}

/** Bet amount typed by the player, with its validation message. */
export function useBet(initial = "1") {
  const { settings, balance, session } = useAccount();
  const [text, setText] = useState(initial);
  const amount = parseAmount(text);
  const problem = !amount
    ? "Escribe tu apuesta."
    : amount < settings.min_bet || amount > settings.max_bet
      ? `La apuesta va de ${usdt(settings.min_bet)} a ${usdt(settings.max_bet)}.`
      : session && amount > balance
        ? "No tienes saldo suficiente."
        : "";
  return { text, setText, amount: problem ? null : amount, problem };
}

export function BetInput({ bet, disabled }: { bet: ReturnType<typeof useBet>; disabled?: boolean }) {
  const { settings, balance } = useAccount();
  const scale = (factor: number) => {
    const value = (parseAmount(bet.text) ?? settings.min_bet) * factor;
    bet.setText(String(Math.min(settings.max_bet, Math.max(settings.min_bet, Math.round(value * 100) / 100))));
  };
  return (
    <div className="flex flex-col gap-1">
      <label className="label">
        Apuesta (USDT)
        <input className="input tabular" inputMode="decimal" value={bet.text} disabled={disabled} onChange={(event) => bet.setText(event.target.value)} />
      </label>
      <div className="flex gap-2">
        <button type="button" className="btn flex-1 py-1 text-xs" disabled={disabled} onClick={() => scale(0.5)}>
          ½
        </button>
        <button type="button" className="btn flex-1 py-1 text-xs" disabled={disabled} onClick={() => scale(2)}>
          2×
        </button>
        <button
          type="button"
          className="btn flex-1 py-1 text-xs"
          disabled={disabled}
          onClick={() => bet.setText(String(Math.max(settings.min_bet, Math.min(settings.max_bet, Math.floor(balance * 100) / 100))))}>
          Máx
        </button>
      </div>
    </div>
  );
}

/** Main action of a game; signed-out visitors get a link to sign in instead. */
export function PlayButton({ label, onClick, disabled, busy, gold }: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean; gold?: boolean }) {
  const { session, loading } = useAccount();
  if (!loading && !session) {
    return (
      <Link href="/entrar" className="btn btn-primary btn-lg">
        Entra para jugar
      </Link>
    );
  }
  return (
    <button type="button" className={`btn btn-lg ${gold ? "btn-gold" : "btn-primary"}`} disabled={disabled || busy} onClick={onClick}>
      {busy ? "…" : label}
    </button>
  );
}

/** Line under the stage telling how the last round ended. */
export function Outcome({ payout, bet, pending }: { payout: number; bet: number; pending?: boolean }) {
  if (pending) return <p className="h-7" />;
  return payout > 0 ? (
    <p className="tabular h-7 text-lg font-bold text-brand">
      +{money(payout)} USDT {payout === bet && <span className="text-sm font-medium text-muted">(apuesta devuelta)</span>}
    </p>
  ) : (
    <p className="tabular h-7 text-lg font-bold text-muted">−{money(bet)} USDT</p>
  );
}

type FrameProps = { game: GameId; controls: ReactNode; children: ReactNode; rules: ReactNode; error?: string };

/** Page layout of a game: controls on the left (below on phones), the table on the right. */
export function GameFrame({ game, controls, children, rules, error }: FrameProps) {
  const { settings } = useAccount();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link href="/casino" className="text-sm text-muted hover:text-white">
          ← Casino
        </Link>
        <h1>
          {GAMES[game].emoji} {GAMES[game].title}
        </h1>
      </div>
      <div className="flex flex-col-reverse gap-4 md:flex-row">
        <section className="card flex flex-col gap-3 md:w-72 md:shrink-0 md:self-start">
          {controls}
          {error && <p className="error">{error}</p>}
        </section>
        <section className="card flex min-h-80 flex-1 flex-col items-center justify-center gap-4 overflow-hidden">{children}</section>
      </div>
      <div className="text-xs leading-relaxed text-muted">
        {rules} Premio máximo por jugada: {usdt(settings.max_payout)}. Los resultados se generan en el servidor con un generador aleatorio
        criptográfico.
      </div>
    </div>
  );
}
