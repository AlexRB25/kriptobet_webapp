"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/lib/account";
import type { SlotsState } from "@/lib/games/types";
import { BetInput, GameFrame, Outcome, PlayButton, useBet, usePlay } from "./shell";

// Mirrors SLOT_SYMBOLS of lib/games/engine.ts.
const PAYTABLE = [
  { symbol: "7️⃣", three: 150, two: 10 },
  { symbol: "💎", three: 50, two: 5 },
  { symbol: "⭐", three: 25, two: 4 },
  { symbol: "🔔", three: 14, two: 3 },
  { symbol: "🍋", three: 9, two: 2 },
  { symbol: "🍒", three: 6, two: 2 },
];
const IDLE: string[][] = [
  ["🍋", "7️⃣", "🍒"],
  ["🔔", "7️⃣", "⭐"],
  ["💎", "7️⃣", "🍋"],
];
/** Shown on a reel while it is still turning, so the result is not readable early. */
const BLUR = ["🍒", "⭐", "🍋"];
/** When each reel stops, in ms after the answer arrives. */
const STOPS = [500, 850, 1200];

export function Slots() {
  const bet = useBet();
  const { setBalance } = useAccount();
  const { busy, error, send } = usePlay<SlotsState>("slots");
  const [reels, setReels] = useState(IDLE);
  /** How many reels have stopped; 3 = at rest. */
  const [stopped, setStopped] = useState(3);
  const [last, setLast] = useState<{ payout: number; bet: number; multiplier: number } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  async function spin() {
    if (!bet.amount) return;
    const stake = bet.amount;
    setStopped(0);
    setLast(null);
    const response = await send({ bet: stake }, true);
    if (!response) return setStopped(3);

    setReels(response.state.reels);
    timers.current = STOPS.map((delay, index) =>
      setTimeout(() => {
        setStopped(index + 1);
        if (index === 2) {
          setLast({ payout: response.payout, bet: stake, multiplier: response.state.multiplier });
          setBalance(response.balance);
        }
      }, delay),
    );
  }

  const spinning = stopped < 3;

  return (
    <GameFrame
      game="slots"
      error={error}
      rules="Paga la fila del centro, de izquierda a derecha: tres símbolos iguales, o los dos primeros iguales. Retorno al jugador: 96.7 %."
      controls={
        <>
          <BetInput bet={bet} disabled={spinning} />
          {bet.problem && <p className="text-xs text-gold">{bet.problem}</p>}
          <PlayButton label="Girar" onClick={spin} busy={busy || spinning} disabled={!bet.amount} />
          <table className="tabular w-full text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="text-left font-medium">Símbolo</th>
                <th className="text-right font-medium">×3</th>
                <th className="text-right font-medium">×2</th>
              </tr>
            </thead>
            <tbody>
              {PAYTABLE.map((row) => (
                <tr key={row.symbol}>
                  <td>{row.symbol}</td>
                  <td className="text-right font-bold">{row.three}×</td>
                  <td className="text-right text-muted">{row.two}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      }>
      <div className="relative flex gap-2 rounded-2xl border-2 border-gold/60 bg-ink p-3">
        {reels.map((reel, index) => (
          <div key={index} className="flex w-20 flex-col overflow-hidden rounded-lg bg-raised sm:w-24">
            {(index >= stopped ? BLUR : reel).map((symbol, row) => (
              <span
                key={row}
                className={`flex h-20 items-center justify-center text-5xl sm:h-24 ${index >= stopped ? "reel-spin" : ""} ${row === 1 ? "" : "opacity-40"}`}>
                {symbol}
              </span>
            ))}
          </div>
        ))}
        {/* The payline. */}
        <div className="pointer-events-none absolute inset-x-1 top-1/2 h-20 -translate-y-1/2 rounded-lg border-2 border-brand/70 sm:h-24" />
      </div>
      {last ? (
        <div className="text-center">
          {last.multiplier > 0 && <p className="text-sm font-semibold text-gold">¡{last.multiplier}× tu apuesta!</p>}
          <Outcome payout={last.payout} bet={last.bet} />
        </div>
      ) : (
        <p className="h-7 text-sm text-muted">{spinning ? "Girando…" : "¡Suerte!"}</p>
      )}
    </GameFrame>
  );
}
