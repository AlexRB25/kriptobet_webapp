"use client";

import { useState } from "react";
import { usdt } from "@/lib/format";
import type { DiceParams, DiceState } from "@/lib/games/types";
import { outcomeSound, sound } from "@/lib/sound";
import { BetInput, GameFrame, Outcome, PlayButton, useBet, usePlay } from "./shell";

// Same formula as diceMultiplier in lib/games/engine.ts (99 % return).
const multiplierFor = (chance: number) => Math.floor(990_000 / Math.round(chance * 100)) / 100;

export function Dados() {
  const bet = useBet();
  const { busy, error, send } = usePlay<DiceState>("dados");
  const [chance, setChance] = useState(50);
  const [direction, setDirection] = useState<DiceParams["direction"]>("under");
  const [last, setLast] = useState<{ state: DiceState; payout: number; bet: number } | null>(null);
  const [history, setHistory] = useState<DiceState[]>([]);

  const multiplier = multiplierFor(chance);
  // Rolls go from 0.00 to 99.99; the winning zone is one end of that range.
  const threshold = direction === "under" ? chance : 100 - chance;

  async function roll() {
    if (!bet.amount) return;
    const response = await send({ bet: bet.amount, chance, direction });
    if (!response) return;
    setLast({ state: response.state, payout: response.payout, bet: bet.amount });
    setHistory((old) => [response.state, ...old].slice(0, 10));
    sound.tick();
    outcomeSound(response.payout, bet.amount);
  }

  return (
    <GameFrame
      game="dados"
      error={error}
      stageClassName="bg-gradient-to-b from-[#161a2e] to-[#090b14]"
      rules="Sale un número entre 0.00 y 99.99. Ganas si cae en la zona verde. Entre menos probabilidad eliges, más paga. Retorno al jugador: 99 %."
      controls={
        <>
          <BetInput bet={bet} disabled={busy} />
          <div className="flex gap-2">
            <button type="button" className={`chip flex-1 ${direction === "under" ? "chip-on" : ""}`} onClick={() => setDirection("under")}>
              Menor que
            </button>
            <button type="button" className={`chip flex-1 ${direction === "over" ? "chip-on" : ""}`} onClick={() => setDirection("over")}>
              Mayor que
            </button>
          </div>
          <label className="label">
            Probabilidad de ganar: {chance} %
            <input type="range" min={1} max={95} step={1} value={chance} onChange={(event) => setChance(Number(event.target.value))} className="accent-brand" />
          </label>
          <dl className="tabular flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Multiplicador</dt>
              <dd className="font-bold">{multiplier.toFixed(2)}×</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Premio</dt>
              <dd className="font-bold text-brand">{usdt(Math.round((bet.amount ?? 0) * multiplier * 100) / 100)}</dd>
            </div>
          </dl>
          {bet.problem && <p className="text-xs text-gold">{bet.problem}</p>}
          <PlayButton label="Tirar" onClick={roll} busy={busy} disabled={!bet.amount} />
        </>
      }>
      <div className="flex h-6 w-full flex-wrap justify-end gap-1 overflow-hidden">
        {history.map((item, index) => (
          <span key={index} className={`tabular rounded-full px-2 text-xs leading-6 font-bold ${item.win ? "bg-brand/20 text-brand" : "bg-bad/20 text-bad"}`}>
            {item.roll.toFixed(2)}
          </span>
        ))}
      </div>
      <p className={`tabular text-7xl font-black ${last ? (last.state.win ? "text-brand" : "text-bad") : "text-muted"}`}>
        {last ? last.state.roll.toFixed(2) : "00.00"}
      </p>
      <div className="w-full max-w-md px-4">
        <div className="relative h-5 rounded-full bg-bad/50 shadow-[inset_0_2px_4px_rgb(0_0_0/0.6)]">
          <div
            className="absolute inset-y-0 rounded-full bg-brand transition-all duration-300"
            style={direction === "under" ? { left: 0, width: `${threshold}%` } : { left: `${threshold}%`, right: 0 }}
          />
          {last && (
            // The die slides along the track to the number rolled.
            <div
              className={`tabular absolute -top-3.5 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-lg border-2 bg-white text-xs font-black text-ink shadow-lg transition-[left] duration-500 ease-out ${
                last.state.win ? "border-brand" : "border-bad"
              }`}
              style={{ left: `${last.state.roll}%` }}>
              {last.state.roll.toFixed(1)}
            </div>
          )}
        </div>
        <div className="tabular mt-6 flex justify-between text-xs text-muted">
          <span>0</span>
          <span>
            {direction === "under" ? "Menor que" : "Mayor o igual a"} {threshold.toFixed(2)}
          </span>
          <span>100</span>
        </div>
      </div>
      {last ? <Outcome payout={last.payout} bet={last.bet} /> : <p className="h-7 text-sm text-muted">Elige tu probabilidad y tira.</p>}
    </GameFrame>
  );
}
