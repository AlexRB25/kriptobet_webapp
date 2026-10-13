"use client";

import { useCallback, useEffect, useState } from "react";
import { RequireSession } from "@/components/require-session";
import { useAccount } from "@/lib/account";
import { api, errorCode } from "@/lib/api";
import { coinName } from "@/lib/crypto";
import { errorMessage } from "@/lib/errors";
import { dateTime, usdt } from "@/lib/format";
import type { Withdrawal } from "@/lib/types";

type Stats = Record<
  "users" | "balances" | "deposits" | "withdrawals_paid" | "withdrawals_pending" | "sports_margin" | "casino_margin" | "pending_bets" | "pending_exposure",
  number
>;
type PendingWithdrawal = Withdrawal & { email: string; profiles: { name: string } | null };
type StaleEvent = { id: string; sport_key: string; home_team: string; away_team: string; commence_time: string };
type Data = { stats: Stats; withdrawals: PendingWithdrawal[]; staleEvents: StaleEvent[] };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-xs text-muted">{label}</p>
      <p className="tabular text-xl font-bold">{value}</p>
    </div>
  );
}

function Admin() {
  const { profile } = useAccount();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const isAdmin = Boolean(profile?.is_admin);

  const load = useCallback(async () => {
    try {
      setData(await api<Data>("/api/admin"));
    } catch (error) {
      setError(errorMessage(errorCode(error)));
    }
  }, []);

  useEffect(() => {
    // Deferred a tick: the loader sets state, which an effect body must not do synchronously.
    if (isAdmin) Promise.resolve().then(load);
  }, [isAdmin, load]);

  async function run(action: () => Promise<string>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      setNotice(await action());
      await load();
    } catch (error) {
      setError(errorMessage(errorCode(error)));
    }
    setBusy(false);
  }

  if (!profile) return <p className="text-sm text-muted">Cargando…</p>;
  if (!isAdmin) return <p className="error">Esta sección es solo para administradores.</p>;

  const resolve = (withdrawal: PendingWithdrawal, status: "paid" | "rejected") => {
    const input =
      status === "paid"
        ? window.prompt(`Hash de la transacción con la que enviaste ${usdt(Number(withdrawal.amount))}:`)
        : window.prompt("Motivo del rechazo (el usuario lo verá). El importe vuelve a su saldo:");
    if (input === null) return;
    void run(async () => {
      await api("/api/admin", { action: "withdrawal", id: withdrawal.id, status, ...(status === "paid" ? { txHash: input } : { note: input }) });
      return status === "paid" ? "Retiro marcado como pagado." : "Retiro rechazado y saldo devuelto.";
    });
  };

  const settle = (event: StaleEvent) => {
    const score = window.prompt(`Marcador final ${event.home_team} – ${event.away_team} (ejemplo: 2-1):`);
    const match = score?.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (score === null || score === undefined) return;
    if (!match) return setError("Escribe el marcador como 2-1.");
    void run(async () => {
      const result = await api<{ bets: number }>("/api/admin", { action: "settle", event: event.id, home: Number(match[1]), away: Number(match[2]) });
      return `Evento liquidado: ${result.bets} apuestas cerradas.`;
    });
  };

  const stats = data?.stats;

  return (
    <div className="flex flex-col gap-5">
      <h1>Panel del operador</h1>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {stats && (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Usuarios" value={String(stats.users)} />
          <Stat label="Saldo de los usuarios" value={usdt(Number(stats.balances))} />
          <Stat label="Depósitos" value={usdt(Number(stats.deposits))} />
          <Stat label="Retiros pagados" value={usdt(Number(stats.withdrawals_paid))} />
          <Stat label="Margen deportes" value={usdt(Number(stats.sports_margin))} />
          <Stat label="Margen casino" value={usdt(Number(stats.casino_margin))} />
          <Stat label="Apuestas pendientes" value={String(stats.pending_bets)} />
          <Stat label="Premios posibles pendientes" value={usdt(Number(stats.pending_exposure))} />
        </section>
      )}

      <section className="card flex flex-col gap-3">
        <h2>Deportes</h2>
        <p className="text-sm text-muted">
          Las cuotas y los resultados se actualizan solos con las tareas programadas. Estos botones las lanzan ahora (cada uno gasta créditos de The
          Odds API).
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const { results } = await api<{ results: Record<string, number | string> }>("/api/cron/sync-odds");
                return Object.entries(results)
                  .map(([sport, result]) => `${sport}: ${typeof result === "number" ? `${result} eventos` : result}`)
                  .join(" · ");
              })
            }>
            Actualizar cuotas
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const result = await api<{ events: number; bets: number; errors: string[] }>("/api/cron/settle");
                return `${result.events} eventos y ${result.bets} apuestas liquidadas. ${result.errors.join(" · ")}`;
              })
            }>
            Liquidar apuestas
          </button>
        </div>
      </section>

      <section className="card flex flex-col gap-3">
        <h2>Retiros por pagar ({data?.withdrawals.length ?? 0})</h2>
        <p className="text-sm text-muted">Envía la cripto desde tu wallet y luego marca el retiro como pagado con el hash de la transacción.</p>
        {data?.withdrawals.map((withdrawal) => (
          <div key={withdrawal.id} className="flex flex-col gap-2 rounded-lg bg-raised p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <b className="tabular">{usdt(Number(withdrawal.amount))}</b> · {coinName(withdrawal.network)}
              <code className="block truncate text-xs">{withdrawal.address}</code>
              <span className="block text-xs text-muted">
                {withdrawal.profiles?.name} · {withdrawal.email} · {dateTime(withdrawal.created_at)}
              </span>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => resolve(withdrawal, "paid")}>
                Pagado
              </button>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => resolve(withdrawal, "rejected")}>
                Rechazar
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="card flex flex-col gap-3">
        <h2>Eventos sin resultado ({data?.staleEvents.length ?? 0})</h2>
        <p className="text-sm text-muted">
          Partidos que empezaron hace más de seis horas y que el proveedor no ha dado por terminados. Pon el marcador a mano o anula el evento (devuelve
          las apuestas simples y cuenta como cuota 1 en las combinadas).
        </p>
        {data?.staleEvents.map((event) => (
          <div key={event.id} className="flex flex-col gap-2 rounded-lg bg-raised p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <b>
                {event.home_team} vs {event.away_team}
              </b>
              <span className="block text-xs text-muted">
                {event.sport_key} · {dateTime(event.commence_time)}
              </span>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => settle(event)}>
                Poner marcador
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`¿Anular ${event.home_team} vs ${event.away_team}?`)) return;
                  void run(async () => {
                    const result = await api<{ bets: number }>("/api/admin", { action: "void", event: event.id });
                    return `Evento anulado: ${result.bets} apuestas cerradas.`;
                  });
                }}>
                Anular
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

export default function AdminPage() {
  return (
    <RequireSession>
      <Admin />
    </RequireSession>
  );
}
