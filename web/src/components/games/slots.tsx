"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useAccount } from "@/lib/account";
import { SLOT_ART } from "@/lib/games/art";
import { SLOT_LINES, SLOT_PAYS, SLOT_SYMBOL_IDS, type SlotSymbol, type SlotWin, type SlotsState } from "@/lib/games/types";
import { outcomeSound, sound } from "@/lib/sound";
import { Art, BetInput, GameFrame, Outcome, PlayButton, useBet, usePlay } from "./shell";

const IDLE: SlotSymbol[][] = [
  ["lemon", "seven", "cherry"],
  ["bell", "seven", "star"],
  ["diamond", "seven", "orange"],
  ["cherry", "seven", "bell"],
  ["star", "seven", "lemon"],
];
const LINE_COLORS = ["#f5b83d", "#29b6f6", "#ff5fa2", "#1fdf7a", "#b388ff"];
/** Milliseconds the first reel turns, and how much longer each next one does. */
const FIRST_STOP = 1100;
const STOP_GAP = 280;

type Spin = {
  id: number;
  /** For each reel: the three symbols it lands on, then the ones that scroll past, then the three it started from. */
  strips: SlotSymbol[][];
};

const randomSymbol = () => SLOT_SYMBOL_IDS[Math.floor(Math.random() * SLOT_SYMBOL_IDS.length)];

export function Slots() {
  const bet = useBet();
  const { setBalance } = useAccount();
  const { busy, error, send } = usePlay<SlotsState>("slots");
  const [grid, setGrid] = useState(IDLE);
  const [spin, setSpin] = useState<Spin | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [last, setLast] = useState<{ payout: number; bet: number; wins: SlotWin[] } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const counter = useRef(0);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  async function play() {
    if (!bet.amount || spinning) return;
    const stake = bet.amount;
    setSpinning(true);
    setSpin(null);
    setLast(null);
    const response = await send({ bet: stake }, true);
    if (!response) return setSpinning(false);

    // The result is already decided: the reels only reveal it, one after another.
    const { reels, wins } = response.state;
    setSpin({
      id: ++counter.current,
      strips: reels.map((reel, index) => [...reel, ...Array.from({ length: 12 + index * 4 }, randomSymbol), ...grid[index]]),
    });
    setGrid(reels);
    sound.spin();
    timers.current = reels.map((_, index) =>
      setTimeout(
        () => {
          sound.tick();
          if (index < reels.length - 1) return;
          setSpinning(false);
          setLast({ payout: response.payout, bet: stake, wins });
          setBalance(response.balance);
          outcomeSound(response.payout, stake);
        },
        FIRST_STOP + index * STOP_GAP,
      ),
    );
  }

  const wins = last?.wins ?? [];
  /** "reel-row" of every cell that is part of a winning line. */
  const winning = new Set(wins.flatMap((win) => Array.from({ length: win.count }, (_, reel) => `${reel}-${SLOT_LINES[win.line][reel]}`)));

  return (
    <GameFrame
      game="slots"
      error={error}
      stageClassName="bg-gradient-to-b from-[#2a1038] to-[#0d0714]"
      rules="Cinco rodillos y cinco líneas de pago fijas: las tres filas y las dos diagonales en V. Tu apuesta se reparte entre las cinco líneas; cada una paga por dos o más símbolos iguales seguidos empezando por el rodillo izquierdo. Retorno al jugador: 96.4 %."
      controls={
        <>
          <BetInput bet={bet} disabled={spinning} />
          {bet.problem && <p className="text-xs text-gold">{bet.problem}</p>}
          <PlayButton label="Girar" onClick={play} busy={busy || spinning} disabled={!bet.amount} />
          <div>
            <p className="mb-1 text-xs font-medium text-muted">Pagos por línea (× apuesta de línea)</p>
            <table className="tabular w-full text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th />
                  {[5, 4, 3, 2].map((count) => (
                    <th key={count} className="text-right font-medium">
                      ×{count}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SLOT_SYMBOL_IDS.map((symbol) => (
                  <tr key={symbol}>
                    <td>
                      <Art source={SLOT_ART[symbol]} className="h-6 w-6" />
                    </td>
                    {[3, 2, 1, 0].map((index) => (
                      <td key={index} className={`text-right ${index === 3 ? "font-bold text-gold" : ""}`}>
                        {SLOT_PAYS[symbol][index]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      }>
      <div
        className="rounded-3xl bg-gradient-to-b from-[#ffe27a] via-[#f5b83d] to-[#8a5a0c] p-2 shadow-[0_10px_40px_rgb(245_184_61/0.25)]"
        style={{ "--cell": "clamp(52px, 15.5vw, 96px)" } as CSSProperties}>
        <div className="flex items-center justify-center gap-2 pb-1.5 text-xs font-black tracking-[0.3em] text-[#3b1d00]">
          {[0, 1, 2].map((dot) => (
            <span key={dot} className="h-2 w-2 rounded-full bg-red" style={{ animation: `marquee-lights 0.9s ${dot * 0.3}s infinite` }} />
          ))}
          KRIPTO SLOTS
          {[0, 1, 2].map((dot) => (
            <span key={dot} className="h-2 w-2 rounded-full bg-red" style={{ animation: `marquee-lights 0.9s ${dot * 0.3}s infinite` }} />
          ))}
        </div>
        <div className="relative flex gap-1 rounded-2xl bg-[#12081a] p-1.5">
          {grid.map((reel, index) => {
            const strip = spinning && spin ? spin.strips[index] : reel;
            return (
              <div
                key={index}
                className="overflow-hidden rounded-lg bg-gradient-to-b from-[#d9d9e3] via-white to-[#d9d9e3] shadow-[inset_0_10px_14px_-6px_rgb(0_0_0/0.55),inset_0_-10px_14px_-6px_rgb(0_0_0/0.55)]"
                style={{ width: "var(--cell)", height: "calc(var(--cell) * 3)" }}>
                <div
                  // Remounted on every spin so the fall starts again from the top of the strip.
                  key={spinning && spin ? spin.id : "rest"}
                  style={
                    spinning && spin
                      ? ({
                          "--from": `calc(var(--cell) * -${strip.length - 3})`,
                          animation: `reel-drop ${FIRST_STOP + index * STOP_GAP}ms cubic-bezier(0.3, 0.85, 0.35, 1.03) both`,
                        } as CSSProperties)
                      : undefined
                  }>
                  {strip.map((symbol, row) => {
                    const won = !spinning && winning.has(`${index}-${row}`);
                    return (
                      <div
                        key={row}
                        className={`flex items-center justify-center ${!spinning && wins.length > 0 && !won ? "opacity-35" : ""}`}
                        style={{ width: "var(--cell)", height: "var(--cell)" }}>
                        <Art source={SLOT_ART[symbol]} className={`h-[78%] w-[78%] ${won ? "win-pulse" : ""}`} />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {/* Winning paylines, drawn over the reels. */}
          <svg viewBox="0 0 5 3" preserveAspectRatio="none" className="pointer-events-none absolute inset-1.5">
            {wins.map((win) => (
              <polyline
                key={win.line}
                points={SLOT_LINES[win.line].map((row, reel) => `${reel + 0.5},${row + 0.5}`).join(" ")}
                fill="none"
                stroke={LINE_COLORS[win.line]}
                strokeWidth={0.07}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.85}
              />
            ))}
          </svg>
        </div>
      </div>

      {last ? (
        <div className="text-center">
          {wins.length > 0 && (
            <p className="text-sm font-semibold text-gold">
              {wins.length === 1 ? "1 línea ganadora" : `${wins.length} líneas ganadoras`}
              {last.payout < last.bet ? " (premio menor que la apuesta)" : ""}
            </p>
          )}
          {last.payout > 0 ? (
            <p className="tabular h-7 text-lg font-bold text-brand">Cobras {last.payout.toFixed(2)} USDT</p>
          ) : (
            <Outcome payout={0} bet={last.bet} />
          )}
        </div>
      ) : (
        <p className="h-7 text-sm text-muted">{spinning ? "Girando…" : "¡Suerte!"}</p>
      )}
    </GameFrame>
  );
}
