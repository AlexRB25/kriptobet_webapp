"use client";

import { useEffect, useState } from "react";
import { useAccount } from "@/lib/account";
import { api } from "@/lib/api";
import { usdt } from "@/lib/format";
import { MINES_TILES, type MinesState } from "@/lib/games/types";
import { BetInput, GameFrame, Outcome, PlayButton, useBet, usePlay } from "./shell";

const MINE_OPTIONS = [1, 3, 5, 10, 15, 24];
type Round = { state: MinesState; bet: number; payout: number };

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
    if (response) setRound({ state: response.state, bet: response.bet ?? round?.bet ?? 0, payout: response.payout });
  }

  const state = round?.state;
  const cashOut = state && round ? Math.round(round.bet * state.multiplier * 100) / 100 : 0;

  return (
    <GameFrame
      game="minas"
      error={error}
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
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: MINES_TILES }, (_, tile) => {
          const safe = state?.revealed.includes(tile);
          const mine = state?.minePositions?.includes(tile);
          return (
            <button
              key={tile}
              type="button"
              aria-label={`Casilla ${tile + 1}`}
              disabled={!playing || busy || safe}
              onClick={() => move({ action: "reveal", tile })}
              className={`flex h-13 w-13 items-center justify-center rounded-lg text-2xl transition sm:h-16 sm:w-16 ${
                safe
                  ? "bg-brand/25"
                  : mine
                    ? state?.hit === tile
                      ? "bg-bad"
                      : "bg-bad/25"
                    : playing
                      ? "cursor-pointer bg-raised hover:brightness-150"
                      : "bg-raised opacity-60"
              }`}>
              {safe ? "💎" : mine ? "💣" : ""}
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
