"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/lib/account";
import { usdt } from "@/lib/format";
import { WHEEL_ORDER, rouletteColor, type RouletteBet, type RouletteBetType, type RouletteState } from "@/lib/games/types";
import { outcomeSound, sound } from "@/lib/sound";
import { Chip, GameFrame, Outcome, PlayButton, usePlay } from "./shell";

const CHIPS = [0.5, 1, 5, 25, 100];
// The felt has three rows; each column of the table goes 3-2-1, 6-5-4, …
const ROWS = [3, 2, 1].map((top) => Array.from({ length: 12 }, (_, column) => column * 3 + top));
const OUTSIDE: { key: string; label: string }[] = [
  { key: "low", label: "1–18" },
  { key: "even", label: "PAR" },
  { key: "red", label: "ROJO" },
  { key: "black", label: "NEGRO" },
  { key: "odd", label: "IMPAR" },
  { key: "high", label: "19–36" },
];
const POCKET = { red: "#c8102e", black: "#141414", green: "#0f8a4b" };
const STEP = 360 / WHEEL_ORDER.length;
const SPIN_MS = 5200;
/** Radius of the ball while it runs along the rim, and once it has dropped into a pocket. */
const TRACK = 90.5;
const POCKET_RING = 51;

/** Point at `radius` from the centre, `degrees` clockwise from the top. */
function polar(radius: number, degrees: number) {
  const angle = (degrees * Math.PI) / 180;
  return `${(radius * Math.sin(angle)).toFixed(2)} ${(-radius * Math.cos(angle)).toFixed(2)}`;
}

/** Slice of a ring between two radii, centred on `degrees`. */
function wedge(inner: number, outer: number, degrees: number) {
  const from = degrees - STEP / 2;
  const to = degrees + STEP / 2;
  return `M${polar(outer, from)} A${outer} ${outer} 0 0 1 ${polar(outer, to)} L${polar(inner, to)} A${inner} ${inner} 0 0 0 ${polar(inner, from)}Z`;
}

type WheelProps = { wheel: number; ball: number; dropped: boolean; moving: boolean };

function Wheel({ wheel, ball, dropped, moving }: WheelProps) {
  const turn = moving ? `transform ${SPIN_MS}ms cubic-bezier(0.18, 0.7, 0.2, 1)` : "none";
  return (
    <svg viewBox="-100 -100 200 200" className="h-64 w-64 shrink-0 drop-shadow-[0_12px_24px_rgb(0_0_0/0.6)] sm:h-72 sm:w-72" role="img" aria-label="Ruleta">
      <defs>
        <radialGradient id="wheel-wood">
          <stop offset="0.85" stopColor="#6b3f1a" />
          <stop offset="1" stopColor="#2e1a0a" />
        </radialGradient>
        <radialGradient id="wheel-gold" cx="40%" cy="35%">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset="0.6" stopColor="#d9a32a" />
          <stop offset="1" stopColor="#7a5410" />
        </radialGradient>
      </defs>
      <circle r="99" fill="url(#wheel-wood)" />
      <circle r="94" fill="#0e0e0e" />
      <g style={{ transform: `rotate(${wheel}deg)`, transition: turn }}>
        {WHEEL_ORDER.map((value, index) => {
          const color = POCKET[rouletteColor(value)];
          return (
            <g key={value}>
              <path d={wedge(60, 87, index * STEP)} fill={color} stroke="#d9a32a" strokeWidth="0.5" />
              <path d={wedge(44, 60, index * STEP)} fill={color} stroke="#d9a32a" strokeWidth="0.5" opacity="0.7" />
              <text
                transform={`rotate(${index * STEP}) translate(0 -76)`}
                fill="#fff"
                fontSize="8"
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle">
                {value}
              </text>
            </g>
          );
        })}
        <circle r="44" fill="url(#wheel-gold)" />
        <circle r="30" fill="none" stroke="#7a5410" strokeWidth="1" />
        {[0, 90].map((angle) => (
          <rect key={angle} x="-3" y="-34" width="6" height="68" rx="3" fill="#b9861c" transform={`rotate(${angle})`} />
        ))}
        <circle r="9" fill="#fff3b0" stroke="#7a5410" strokeWidth="1.5" />
      </g>
      <g style={{ transform: `rotate(${ball}deg)`, transition: turn }}>
        <circle
          r="3.6"
          fill="#fff"
          stroke="#bbb"
          strokeWidth="0.5"
          style={{
            transform: `translateY(${-(dropped ? POCKET_RING : TRACK)}px)`,
            // The ball leaves the rim during the last part of the spin.
            transition: moving ? `transform 1100ms ease-in ${SPIN_MS - 1700}ms` : "none",
          }}
        />
      </g>
    </svg>
  );
}

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
  const [motion, setMotion] = useState({ wheel: 0, ball: 0, dropped: false, moving: false });
  const [spinning, setSpinning] = useState(false);
  const [last, setLast] = useState<{ payout: number; bet: number; number: number } | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

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
    if (spinning) return;
    sound.chip();
    setBets((old) => ({ ...old, [key]: Math.round(((old[key] ?? 0) + chip) * 100) / 100 }));
  };

  async function spin() {
    if (problem || spinning) return;
    setSpinning(true);
    setLast(null);
    // The ball goes back to the rim, without animation, before the next throw.
    setMotion((old) => ({ ...old, dropped: false, moving: false }));
    const response = await send({ bets: Object.entries(bets).map(([key, amount]) => toBet(key, amount)) }, true);
    if (!response) return setSpinning(false);

    // The wheel turns clockwise and the ball against it; both stop with the ball over the winning pocket.
    const pocket = WHEEL_ORDER.indexOf(response.state.number) * STEP;
    sound.spin();
    setMotion((old) => {
      const wheel = old.wheel + 720 + Math.random() * 360;
      const target = wheel + pocket;
      const ball = target - 360 * Math.ceil((target - old.ball + 1440) / 360);
      return { wheel, ball, dropped: true, moving: true };
    });
    timer.current = setTimeout(() => {
      setSpinning(false);
      setLast({ payout: response.payout, bet: total, number: response.state.number });
      setHistory((old) => [response.state.number, ...old].slice(0, 14));
      setBalance(response.balance);
      outcomeSound(response.payout, total);
    }, SPIN_MS + 150);
  }

  /** A spot of the felt with the chips on it. */
  const spot = (key: string, label: string, className: string, color?: string) => (
    <button
      key={key}
      type="button"
      onClick={() => place(key)}
      style={color ? { background: color } : undefined}
      className={`relative flex h-11 cursor-pointer items-center justify-center border border-white/50 text-sm font-bold text-white transition hover:brightness-150 ${className} ${
        last && key === `straight:${last.number}` ? "z-10 outline-3 outline-gold" : ""
      }`}>
      {label}
      {bets[key] ? (
        <span className="absolute inset-0 z-10 flex items-center justify-center">
          <Chip amount={bets[key]} size={26} />
        </span>
      ) : null}
    </button>
  );

  return (
    <GameFrame
      game="ruleta"
      error={error}
      stageClassName="felt"
      rules="Ruleta europea (0–36). Pleno paga 35 a 1; docenas y columnas 2 a 1; rojo/negro, par/impar y mitades 1 a 1. Retorno al jugador: 97.3 %."
      controls={
        <>
          <p className="label">Valor de la ficha</p>
          <div className="flex justify-between">
            {CHIPS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={chip === value}
                aria-label={`Ficha de ${value}`}
                onClick={() => setChip(value)}
                className={`cursor-pointer rounded-full transition ${chip === value ? "-translate-y-1 outline-2 outline-offset-2 outline-brand" : "opacity-70 hover:opacity-100"}`}>
                <Chip amount={value} size={42} />
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
            <div>
              <p className="mb-1 text-xs font-medium text-muted">Últimos números</p>
              <div className="flex flex-wrap gap-1">
                {history.map((value, index) => (
                  <span
                    key={index}
                    className="tabular flex h-6 w-6 items-center justify-center rounded text-xs font-bold"
                    style={{ background: POCKET[rouletteColor(value)] }}>
                    {value}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      }>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-8">
        <Wheel {...motion} />
        <div className="flex flex-col items-center gap-2">
          <div
            className="tabular flex h-20 w-20 items-center justify-center rounded-xl border-2 border-gold text-4xl font-black shadow-lg"
            style={{ background: last ? POCKET[rouletteColor(last.number)] : "rgb(0 0 0 / 0.35)" }}>
            {last ? last.number : "–"}
          </div>
          {last ? <Outcome payout={last.payout} bet={last.bet} /> : <p className="h-7 text-sm text-white/70">{spinning ? "No va más…" : "Hagan sus apuestas"}</p>}
        </div>
      </div>

      <div className="w-full overflow-x-auto pb-1">
        <div className="mx-auto flex w-max rounded-lg border-2 border-white/60 bg-[#0b5d3b] p-1">
          {spot("straight:0", "0", "h-auto! w-11 rounded-l-md", POCKET.green)}
          <div className="flex flex-col">
            {ROWS.map((row, index) => (
              <div key={index} className="flex">
                {row.map((value) => spot(`straight:${value}`, String(value), "w-11", POCKET[rouletteColor(value)]))}
                {spot(`column:${3 - index}`, "2 a 1", "w-14 text-xs")}
              </div>
            ))}
            <div className="mr-14 grid grid-cols-3">{[1, 2, 3].map((dozen) => spot(`dozen:${dozen}`, `${dozen}ª DOCENA`, "text-xs"))}</div>
            <div className="mr-14 grid grid-cols-6">
              {OUTSIDE.map((item) => spot(item.key, item.label, "text-xs", item.key === "red" ? POCKET.red : item.key === "black" ? POCKET.black : undefined))}
            </div>
          </div>
        </div>
      </div>
    </GameFrame>
  );
}
