"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "@/lib/account";
import { errorCode } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { odds as formatOdds, parseAmount, usdt } from "@/lib/format";
import { slip, useSlip } from "@/lib/slip";
import { supabase } from "@/lib/supabase";

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Reads the current price of every pick; picks that can no longer be bet on come back without one. */
async function currentPrices(ids: string[]) {
  const { data } = await supabase().from("odds").select("id, price, active, events(status, commence_time)").in("id", ids);
  const prices = new Map<string, number>();
  for (const row of data ?? []) {
    // The embed is one event per odd; depending on the client's inference it may be typed as a list.
    const event = (Array.isArray(row.events) ? row.events[0] : row.events) as { status: string; commence_time: string } | null;
    if (row.active && event?.status === "upcoming" && new Date(event.commence_time) > new Date()) prices.set(row.id, Number(row.price));
  }
  return prices;
}

/** The bet slip: a side panel on desktop, a bar that expands from the bottom on phones. */
export function BetSlip() {
  const selections = useSlip();
  const { session, balance, setBalance, settings } = useAccount();
  const [stake, setStake] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);

  const totalOdds = round2(selections.reduce((total, item) => total * item.price, 1));
  const amount = parseAmount(stake);
  const payout = amount ? round2(amount * totalOdds) : 0;
  const problem = !amount
    ? "Escribe cuánto quieres apostar."
    : amount < settings.min_bet || amount > settings.max_bet
      ? `La apuesta va de ${usdt(settings.min_bet)} a ${usdt(settings.max_bet)}.`
      : payout > settings.max_payout
        ? `El premio máximo por apuesta es ${usdt(settings.max_payout)}.`
        : selections.length > settings.max_selections
          ? `Máximo ${settings.max_selections} selecciones por boleto.`
          : session && amount > balance
            ? "No tienes saldo suficiente."
            : "";

  async function place() {
    if (!amount) return;
    setError("");
    setNotice("");
    setBusy(true);
    const { data, error } = await supabase().rpc("place_bet", {
      p_stake: amount,
      p_selections: selections.map((item) => ({ odds_id: item.oddsId, price: item.price })),
    });
    if (error) {
      const code = errorCode(error);
      // The slip is brought up to date so the user confirms the prices that are really on offer.
      if (code === "odds_changed" || code === "selection_closed") slip.reprice(await currentPrices(selections.map((item) => item.oddsId)));
      setError(errorMessage(code));
    } else {
      setBalance(Number(data.balance));
      slip.clear();
      setNotice(`¡Apuesta registrada! Si aciertas cobras ${usdt(Number(data.potential_payout))}.`);
    }
    setBusy(false);
  }

  const empty = selections.length === 0;

  return (
    <aside
      className={`fixed inset-x-0 bottom-14 z-20 border-t border-line bg-panel md:sticky md:inset-auto md:top-20 md:w-80 md:shrink-0 md:self-start md:rounded-xl md:border ${
        empty && !notice ? "hidden md:block" : ""
      }`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left md:cursor-default"
        aria-expanded={open}>
        <span className="font-bold">
          Boleto {!empty && <span className="ml-1 rounded-full bg-brand px-2 py-0.5 text-xs text-ink">{selections.length}</span>}
        </span>
        {!empty && (
          <span className="tabular text-sm text-muted">
            Cuota <b className="text-white">{formatOdds(totalOdds)}</b> <span className="md:hidden">{open ? "▾" : "▴"}</span>
          </span>
        )}
      </button>

      <div className={`${open ? "flex" : "hidden"} max-h-[60vh] flex-col gap-3 overflow-y-auto px-4 pb-4 md:flex md:max-h-[70vh]`}>
        {notice && <p className="notice">{notice}</p>}
        {empty ? (
          <p className="text-sm text-muted">Toca una cuota para agregarla. Con varias selecciones armas una combinada.</p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {selections.map((item) => (
                <li key={item.oddsId} className="flex items-start gap-2 rounded-lg bg-raised p-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{item.pick}</p>
                    <p className="truncate text-xs text-muted">{item.eventName}</p>
                  </div>
                  <span className="tabular font-bold text-brand">{formatOdds(item.price)}</span>
                  <button type="button" aria-label="Quitar" className="cursor-pointer px-1 text-muted hover:text-white" onClick={() => slip.remove(item.oddsId)}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <label className="label">
              Importe (USDT)
              <input className="input tabular" inputMode="decimal" value={stake} onChange={(event) => setStake(event.target.value)} />
            </label>
            <div className="flex gap-2">
              {[5, 10, 25, 50].map((value) => (
                <button key={value} type="button" className="btn flex-1 px-0 py-1.5 text-xs" onClick={() => setStake(String(value))}>
                  {value}
                </button>
              ))}
            </div>
            <dl className="tabular flex flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">{selections.length > 1 ? `Combinada de ${selections.length}` : "Apuesta simple"}</dt>
                <dd>{formatOdds(totalOdds)}</dd>
              </div>
              <div className="flex justify-between font-bold">
                <dt>Posible premio</dt>
                <dd className="text-brand">{usdt(payout)}</dd>
              </div>
            </dl>
            {error && <p className="error">{error}</p>}
            {session ? (
              <>
                {problem && <p className="text-xs text-gold">{problem}</p>}
                <button type="button" className="btn btn-primary btn-lg" disabled={busy || Boolean(problem)} onClick={place}>
                  {busy ? "Enviando…" : `Apostar ${amount ? usdt(amount) : ""}`}
                </button>
              </>
            ) : (
              <Link href="/entrar" className="btn btn-primary btn-lg">
                Entra para apostar
              </Link>
            )}
            <button type="button" className="cursor-pointer text-xs text-muted underline" onClick={slip.clear}>
              Vaciar boleto
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
