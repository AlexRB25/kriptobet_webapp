"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/lib/account";
import { money, usdt } from "@/lib/format";
import { rouletteColor, type RouletteBet, type RouletteBetType, type RouletteState } from "@/lib/games/types";
import { GameFrame, Outcome, PlayButton, usePlay } from "./shell";

const CHIPS = [0.5, 1, 5, 25];
// The felt has three rows; each column of the table goes 3-2-1, 6-5-4, …
const ROWS = [3, 2, 1].map((top) => Array.from({ length: 12 }, (_, column) => column * 3 + top));
const OUTSIDE: { key: string; label: string }[] = [
  { key: "low", label: "1–18" },
  { key: "even", label: "Par" },
  { key: "red", label: "Rojo" },
  { key: "black", label: "Negro" },
  { key: "odd", label: "Impar" },
  { key: "high", label: "19–36" },
];
const COLORS = { red: "bg-red", black: "bg-neutral-900", green: "bg-brand-deep" };

/** "straight:17" → { type: "straight", value: 17 } */
function toBet(key: string, amount: number): RouletteBet {
  const [type, value] = key.split(":");
  return { type: type as RouletteBetType, ...(value === undefined ? {} : { value: Number(value) }), amount };
}

export function Ruleta() {
  const { session, balance, setBalance, settings } = useAccount();
  const { busy, error, send } = usePlay<RouletteState>("ruleta");
  const [chip, setChip] = useState(1);
  /** Amount placed on each spot of the felt. */
  const [bets, setBets] = useState<Record<string, number>>({});
  const [shown, setShown] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [last, setLast] = useState<{ payout: number; bet: number; number: number } | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => () => clearInterval(timer.current), []);

  const total = Math.round(Object.values(bets).reduce((sum, value) => sum + value, 0) * 100) / 100;
  const problem =
    total === 0
      ? "Toca la mesa para poner fichas."
      : total < settings.min_bet || total > settings.max_bet
        ? `El total va de ${usdt(settings.min_bet)} a ${usdt(settings.max_bet)}.`
        : session && total > balance
          ? "No tienes saldo suficiente."
          : "";

  const place = (key: string) => {
    if (!spinning) setBets((old) => ({ ...old, [key]: Math.round(((old[key] ?? 0) + chip) * 100) / 100 }));
  };

  async function spin() {
    if (problem) return;
    setSpinning(true);
    setLast(null);
    timer.current = setInterval(() => setShown(Math.floor(Math.random() * 37)), 70);
    const [response] = await Promise.all([
      send({ bets: Object.entries(bets).map(([key, amount]) => toBet(key, amount)) }, true),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]);
    clearInterval(timer.current);
    setSpinning(false);
    if (!response) return setShown(null);
    setShown(response.state.number);
    setLast({ payout: response.payout, bet: total, number: response.state.number });
    setHistory((old) => [response.state.number, ...old].slice(0, 12));
    setBalance(response.balance);
  }

  /** A spot of the felt with the chips on it. */
  const spot = (key: string, label: string, className: string) => (
    <button
      key={key}
      type="button"
      onClick={() => place(key)}
      className={`relative flex h-10 cursor-pointer items-center justify-center rounded border border-white/15 text-sm font-bold transition hover:brightness-150 ${className}`}>
      {label}
      {bets[key] ? (
        <span className="tabular absolute -top-1.5 -right-1.5 z-10 rounded-full bg-gold px-1.5 text-[10px] leading-4 text-ink">{money(bets[key])}</span>
      ) : null}
    </button>
  );

  return (
    <GameFrame
      game="ruleta"
      error={error}
      rules="Ruleta europea (0–36). Pleno paga 35 a 1; docenas y columnas 2 a 1; rojo/negro, par/impar y mitades 1 a 1. Retorno al jugador: 97.3 %."
      controls={
        <>
          <p className="label">Valor de la ficha</p>
          <div className="flex gap-2">
            {CHIPS.map((value) => (
              <button key={value} type="button" className={`chip flex-1 px-0 text-center ${chip === value ? "chip-on" : ""}`} onClick={() => setChip(value)}>
                {value}
              </button>
            ))}
          </div>
          <div className="tabular flex justify-between text-sm">
            <span className="text-muted">Total apostado</span>
            <b>{usdt(total)}</b>
          </div>
          {problem && <p className="text-xs text-gold">{problem}</p>}
          <PlayButton label="Girar" onClick={spin} busy={busy || spinning} disabled={Boolean(problem)} />
          <button type="button" className="btn" disabled={spinning || total === 0} onClick={() => setBets({})}>
            Quitar fichas
          </button>
          {history.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {history.map((value, index) => (
                <span key={index} className={`tabular flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${COLORS[rouletteColor(value)]}`}>
                  {value}
                </span>
              ))}
            </div>
          )}
        </>
      }>
      <div
        className={`tabular flex h-24 w-24 items-center justify-center rounded-full border-4 border-gold/70 text-5xl font-black ${
          shown === null ? "bg-raised text-muted" : COLORS[rouletteColor(shown)]
        }`}>
        {shown ?? "?"}
      </div>
      {last ? <Outcome payout={last.payout} bet={last.bet} /> : <p className="h-7 text-sm text-muted">{spinning ? "Girando…" : "Hagan sus apuestas."}</p>}

      <div className="w-full overflow-x-auto pt-2 pb-1">
        <div className="mx-auto flex w-max gap-1">
          {spot("straight:0", "0", `${COLORS.green} h-auto! w-10`)}
          <div className="flex flex-col gap-1">
            {ROWS.map((row, index) => (
              <div key={index} className="flex gap-1">
                {row.map((value) => spot(`straight:${value}`, String(value), `${COLORS[rouletteColor(value)]} w-10`))}
                {spot(`column:${3 - index}`, "2:1", "w-12 bg-raised text-xs")}
              </div>
            ))}
            <div className="mr-13 grid grid-cols-3 gap-1">
              {[1, 2, 3].map((dozen) => spot(`dozen:${dozen}`, `${dozen}ª docena`, "bg-raised text-xs"))}
            </div>
            <div className="mr-13 grid grid-cols-6 gap-1">
              {OUTSIDE.map((item) =>
                spot(item.key, item.label, `text-xs ${item.key === "red" ? COLORS.red : item.key === "black" ? COLORS.black : "bg-raised"}`),
              )}
            </div>
          </div>
        </div>
      </div>
    </GameFrame>
  );
}
