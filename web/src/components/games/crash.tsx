"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/lib/account";
import { parseAmount, usdt } from "@/lib/format";
import { ROCKET_ART, artUrl } from "@/lib/games/art";
import type { CrashState } from "@/lib/games/types";
import { sound } from "@/lib/sound";
import { BetInput, GameFrame, Outcome, PlayButton, useBet, usePlay } from "./shell";

/** Seconds the climb lasts at most, however high the round goes. */
const MAX_SECONDS = 6;
const GROWTH = 0.35;
// Chart area, in SVG units.
const WIDTH = 400;
const HEIGHT = 240;
const PAD = { left: 34, bottom: 22, top: 14, right: 26 };

/** Curve of the round so far and where its tip is. The scale grows with the multiplier, as on a real crash chart. */
function chart(shown: number) {
  const top = Math.max(2, shown * 1.15);
  const x = (share: number) => PAD.left + share * (WIDTH - PAD.left - PAD.right);
  const y = (value: number) => HEIGHT - PAD.bottom - ((value - 1) / (top - 1)) * (HEIGHT - PAD.bottom - PAD.top);
  const steps = 40;
  const points = Array.from({ length: steps + 1 }, (_, index) => {
    const share = index / steps;
    // Same exponential shape as the climb: value(share) = shown^share.
    return `${x(share * 0.92).toFixed(1)},${y(Math.pow(shown, share)).toFixed(1)}`;
  });
  const ticks = [1, 1 + (top - 1) / 3, 1 + ((top - 1) * 2) / 3, top].map((value) => ({ value, y: y(value) }));
  return { line: points.join(" "), tip: { x: x(0.92), y: y(shown) }, base: y(1), start: x(0), ticks };
}

export function Crash() {
  const bet = useBet();
  const { setBalance } = useAccount();
  const { busy, error, send } = usePlay<CrashState>("crash");
  const [targetText, setTargetText] = useState("2.00");
  const [shown, setShown] = useState(1);
  const [round, setRound] = useState<{ state: CrashState; payout: number; bet: number; flying: boolean } | null>(null);
  const [history, setHistory] = useState<number[]>([]);
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
    const { point, win } = response.state;
    const seconds = Math.min(MAX_SECONDS, Math.log(point) / GROWTH);
    const rate = seconds > 0 ? Math.log(point) / seconds : 0;
    const startedAt = performance.now();
    let cashed = false;
    setRound({ state: response.state, payout: response.payout, bet: stake, flying: true });
    setShown(1);
    sound.spin();

    const tick = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      const value = Math.exp(rate * elapsed);
      if (win && !cashed && value >= response.state.target) {
        cashed = true;
        sound.win();
      }
      if (elapsed >= seconds) {
        setShown(point);
        setRound((old) => old && { ...old, flying: false });
        setHistory((old) => [point, ...old].slice(0, 10));
        setBalance(response.balance);
        if (!win) sound.boom();
        return;
      }
      setShown(value);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }

  const flying = Boolean(round?.flying);
  const cashed = round && round.state.win && shown >= round.state.target;
  const crashed = Boolean(round && !flying);
  const { line, tip, base, start, ticks } = chart(shown);
  const color = crashed ? "#f87171" : "#1fdf7a";

  return (
    <GameFrame
      game="crash"
      error={error}
      stageClassName="bg-gradient-to-b from-[#0b1220] to-[#05080f]"
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
                {Number(value)}×
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
      <div className="flex h-6 w-full flex-wrap justify-end gap-1 overflow-hidden">
        {history.map((point, index) => (
          <span key={index} className={`tabular rounded-full px-2 text-xs leading-6 font-bold ${point >= 2 ? "bg-brand/20 text-brand" : "bg-bad/20 text-bad"}`}>
            {point.toFixed(2)}×
          </span>
        ))}
      </div>

      <div className="relative w-full max-w-2xl">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label={`Multiplicador ${shown.toFixed(2)}`}>
          <defs>
            <linearGradient id="crash-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.45" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((tick, index) => (
            <g key={index}>
              <line x1={PAD.left} x2={WIDTH - 6} y1={tick.y} y2={tick.y} stroke="rgb(255 255 255 / 0.08)" />
              <text x={PAD.left - 5} y={tick.y + 3} fill="#8fa39b" fontSize="9" textAnchor="end">
                {tick.value.toFixed(tick.value < 10 ? 1 : 0)}×
              </text>
            </g>
          ))}
          {round && round.state.target <= Math.max(2, shown * 1.15) && (
            // The cash-out level the player chose.
            <line
              x1={PAD.left}
              x2={WIDTH - 6}
              y1={ticks[0].y - ((round.state.target - 1) / (ticks[3].value - 1)) * (ticks[0].y - ticks[3].y)}
              y2={ticks[0].y - ((round.state.target - 1) / (ticks[3].value - 1)) * (ticks[0].y - ticks[3].y)}
              stroke="#f5b83d"
              strokeDasharray="5 4"
            />
          )}
          <polygon points={`${start},${base} ${line} ${tip.x},${base}`} fill="url(#crash-fill)" />
          <polyline points={line} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          {crashed ? (
            <text x={tip.x} y={tip.y + 8} fontSize="26" textAnchor="middle">
              💥
            </text>
          ) : (
            <image href={artUrl(ROCKET_ART)} x={tip.x - 16} y={tip.y - 20} width="34" height="34" />
          )}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className={`tabular text-6xl font-black drop-shadow-[0_2px_8px_rgb(0_0_0/0.8)] sm:text-7xl ${crashed ? "text-bad" : flying ? "text-white" : "text-white/60"}`}>
            {shown.toFixed(2)}×
          </p>
          <p className="h-6 text-sm font-bold">
            {cashed ? (
              <span className="rounded-full bg-brand px-3 py-0.5 text-ink">✓ Cobraste en {round.state.target.toFixed(2)}×</span>
            ) : crashed ? (
              <span className="text-bad">EXPLOTÓ</span>
            ) : null}
          </p>
        </div>
      </div>
      {round ? <Outcome payout={round.payout} bet={round.bet} pending={flying} /> : <p className="h-7 text-sm text-muted">Elige en cuánto cobrar y despega.</p>}
    </GameFrame>
  );
}
