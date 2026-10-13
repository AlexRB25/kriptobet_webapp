"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/lib/account";
import { parseAmount, usdt } from "@/lib/format";
import type { CrashState } from "@/lib/games/types";
import { BetInput, GameFrame, Outcome, PlayButton, useBet, usePlay } from "./shell";

/** Seconds the climb lasts at most, however high the round goes. */
const MAX_SECONDS = 5;
const GROWTH = 0.35;

export function Crash() {
  const bet = useBet();
  const { setBalance } = useAccount();
  const { busy, error, send } = usePlay<CrashState>("crash");
  const [targetText, setTargetText] = useState("2.00");
  const [shown, setShown] = useState(1);
  const [round, setRound] = useState<{ state: CrashState; payout: number; bet: number; flying: boolean } | null>(null);
  const frame = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const target = parseAmount(targetText);
  const validTarget = target !== null && target >= 1.01 && target <= 1000;

  async function play() {
    if (!bet.amount || !validTarget) return;
    const stake = bet.amount;
    const response = await send({ bet: stake, target }, true);
    if (!response) return;

    // The outcome is already decided; the climb only reveals it.
    const { point } = response.state;
    const seconds = Math.min(MAX_SECONDS, Math.log(point) / GROWTH);
    const rate = seconds > 0 ? Math.log(point) / seconds : 0;
    const startedAt = performance.now();
    setRound({ state: response.state, payout: response.payout, bet: stake, flying: true });
    setShown(1);

    const tick = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      if (elapsed >= seconds) {
        setShown(point);
        setRound((old) => old && { ...old, flying: false });
        setBalance(response.balance);
        return;
      }
      setShown(Math.exp(rate * elapsed));
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }

  const flying = Boolean(round?.flying);
  const cashed = round && round.state.win && shown >= round.state.target;
  const crashed = round && !flying;

  return (
    <GameFrame
      game="crash"
      error={error}
      rules="El multiplicador sube hasta que explota. Eliges de antemano en cuánto cobrar: si llega a tu objetivo ganas tu apuesta por ese multiplicador; si explota antes, la pierdes. Retorno al jugador: 99 %."
      controls={
        <>
          <BetInput bet={bet} disabled={busy || flying} />
          <label className="label">
            Cobrar en (multiplicador)
            <input className="input tabular" inputMode="decimal" value={targetText} disabled={busy || flying} onChange={(event) => setTargetText(event.target.value)} />
          </label>
          <div className="flex gap-2">
            {["1.50", "2.00", "5.00", "10.00"].map((value) => (
              <button key={value} type="button" className="btn flex-1 px-0 py-1 text-xs" disabled={flying} onClick={() => setTargetText(value)}>
                {value}×
              </button>
            ))}
          </div>
          <dl className="tabular flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Probabilidad</dt>
              <dd className="font-bold">{validTarget ? (99 / target).toFixed(2) : "—"} %</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Premio</dt>
              <dd className="font-bold text-brand">{usdt(validTarget ? Math.round((bet.amount ?? 0) * target * 100) / 100 : 0)}</dd>
            </div>
          </dl>
          {(bet.problem || !validTarget) && <p className="text-xs text-gold">{bet.problem || "El objetivo va de 1.01× a 1000×."}</p>}
          <PlayButton label="Despegar" onClick={play} busy={busy || flying} disabled={!bet.amount || !validTarget} />
        </>
      }>
      <p className="text-5xl">{crashed ? "💥" : "🚀"}</p>
      <p className={`tabular text-7xl font-black ${crashed ? (round.state.win ? "text-brand" : "text-bad") : flying ? "text-white" : "text-muted"}`}>
        {shown.toFixed(2)}×
      </p>
      <p className="h-5 text-sm font-semibold text-brand">{cashed ? `✓ Cobraste en ${round.state.target.toFixed(2)}×` : ""}</p>
      {round ? <Outcome payout={round.payout} bet={round.bet} pending={flying} /> : <p className="h-7 text-sm text-muted">Elige en cuánto cobrar y despega.</p>}
    </GameFrame>
  );
}
