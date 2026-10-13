"use client";

import { useEffect, useState } from "react";
import { useAccount } from "@/lib/account";
import { api } from "@/lib/api";
import { usdt } from "@/lib/format";
import { BOMB_ART, GEM_ART } from "@/lib/games/art";
import { MINES_TILES, type MinesState } from "@/lib/games/types";
import { outcomeSound, sound } from "@/lib/sound";
import { Art, BetInput, GameFrame, Outcome, PlayButton, useBet, usePlay } from "./shell";

const MINE_OPTIONS = [1, 3, 5, 10, 15, 24];
type Round = { state: MinesState; bet: number; payout: number };

const CLOSED = "bg-gradient-to-b from-[#3d5566] to-[#2a3c49] shadow-[0_5px_0_#17232b]";
const PRESSABLE = "cursor-pointer hover:-translate-y-0.5 hover:from-[#4d6a7f] active:translate-y-1 active:shadow-none";

export function Minas() {
  const bet = useBet();
  const { session } = useAccount();
  const { busy, error, send } = usePlay<MinesState>("minas");
  const [mines, setMines] = useState(3);
  const [round, setRound] = useState<Round | null>(null);

  // A round left open (reload, another device) is picked up where it was.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    api<{ round: { bet: number; state: MinesState } | null }>("/api/games/minas")
      .then((data) => {
        if (!cancelled && data.round) setRound({ state: data.round.state, bet: data.round.bet, payout: 0 });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session]);

  const playing = Boolean(round && !round.state.over);

  async function move(body: object) {
    const response = await send(body);
    if (!response) return;
    const stake = response.bet ?? round?.bet ?? 0;
    setRound({ state: response.state, bet: stake, payout: response.payout });
    if (response.state.hit !== null) sound.boom();
    else if (response.state.over) outcomeSound(response.payout, stake);
    else if (response.state.revealed.length > 0) sound.gem();
    else sound.chip();
  }

  const state = round?.state;
  const cashOut = state && round ? Math.round(round.bet * state.multiplier * 100) / 100 : 0;
  const exploded = state ? state.hit !== null : false;

  return (
    <GameFrame
      game="minas"
      error={error}
      stageClassName="bg-gradient-to-b from-[#10202b] to-[#070d12]"
      rules="Hay minas escondidas en 25 casillas. Cada casilla segura que destapas sube el multiplicador; puedes cobrar cuando quieras, pero si destapas una mina pierdes la apuesta. Retorno al jugador: 99 %."
      controls={
        <>
          <BetInput bet={bet} disabled={playing || busy} />
          <p className="label">Minas</p>
          <div className="grid grid-cols-6 gap-1">
            {MINE_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                disabled={playing}
                className={`chip px-0 text-center ${mines === value ? "chip-on" : ""}`}
                onClick={() => setMines(value)}>
                {value}
              </button>
            ))}
          </div>
          {playing && state ? (
            <>
              <dl className="tabular flex flex-col gap-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Multiplicador</dt>
                  <dd className="font-bold">{state.multiplier.toFixed(2)}×</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Siguiente casilla</dt>
                  <dd>{state.next?.toFixed(2)}×</dd>
                </div>
              </dl>
              <PlayButton
                gold
                label={state.revealed.length ? `Cobrar ${usdt(cashOut)}` : "Destapa una casilla"}
                onClick={() => move({ action: "cashout" })}
                busy={busy}
                disabled={state.revealed.length === 0}
              />
            </>
          ) : (
            <>
              {bet.problem && <p className="text-xs text-gold">{bet.problem}</p>}
              <PlayButton label="Empezar" onClick={() => move({ action: "start", bet: bet.amount, mines })} busy={busy} disabled={!bet.amount} />
            </>
          )}
        </>
      }>
      <div className="flex gap-6 text-sm text-white/80">
        <span className="flex items-center gap-1.5">
          <Art source={GEM_ART} className="h-5 w-5" /> {MINES_TILES - (state?.mines ?? mines) - (state?.revealed.length ?? 0)} gemas
        </span>
        <span className="flex items-center gap-1.5">
          <Art source={BOMB_ART} className="h-5 w-5" /> {state?.mines ?? mines} minas
        </span>
      </div>
      <div className={`grid grid-cols-5 gap-2 ${exploded ? "shake" : ""}`} style={{ perspective: 600 }}>
        {Array.from({ length: MINES_TILES }, (_, tile) => {
          const safe = Boolean(state?.revealed.includes(tile));
          const mine = Boolean(state?.minePositions?.includes(tile));
          const hit = state?.hit === tile;
          const face = safe
            ? "tile-flip bg-[#0d3324] shadow-[inset_0_0_0_2px_rgb(31_223_122/0.5)]"
            : hit
              ? "tile-flip bg-red shadow-[0_0_24px_rgb(224_55_63/0.8)]"
              : mine
                ? "tile-flip bg-[#2a1215]"
                : `${CLOSED} ${playing ? PRESSABLE : ""}`;
          return (
            <button
              key={tile}
              type="button"
              aria-label={`Casilla ${tile + 1}`}
              disabled={!playing || busy || safe}
              onClick={() => move({ action: "reveal", tile })}
              className={`flex h-14 w-14 items-center justify-center rounded-xl transition sm:h-18 sm:w-18 ${face}`}>
              {(safe || mine) && <Art source={safe ? GEM_ART : BOMB_ART} className={`h-[68%] w-[68%] ${mine && !hit ? "opacity-60" : ""}`} />}
            </button>
          );
        })}
      </div>
      {round && state?.over ? (
        <Outcome payout={round.payout} bet={round.bet} />
      ) : (
        <p className="h-7 text-sm text-muted">{playing ? "Destapa casillas o cobra." : "Elige cuántas minas y empieza."}</p>
      )}
    </GameFrame>
  );
}
