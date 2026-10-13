"use client";

import Link from "next/link";
import { useState } from "react";
import { RequireSession } from "@/components/require-session";
import { useAccount } from "@/lib/account";
import { errorCode } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { dateTime, parseAmount, usdt } from "@/lib/format";
import { supabase } from "@/lib/supabase";

const EXCLUSIONS = [
  { days: 1, label: "24 horas" },
  { days: 7, label: "1 semana" },
  { days: 30, label: "1 mes" },
  { days: 180, label: "6 meses" },
  { days: 365, label: "1 año" },
];

function Account() {
  const { session, profile, refresh } = useAccount();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(7);
  const [limit, setLimit] = useState(profile?.daily_deposit_limit ? String(profile.daily_deposit_limit) : "");

  const excludedUntil = profile?.excluded_until && new Date(profile.excluded_until) > new Date() ? profile.excluded_until : null;

  async function call(name: string, args: object, done: string) {
    setError("");
    setNotice("");
    setBusy(true);
    const { error } = await supabase().rpc(name, args);
    setBusy(false);
    if (error) return setError(errorMessage(errorCode(error)));
    setNotice(done);
    await refresh();
  }

  function saveLimit() {
    const value = limit.trim() ? parseAmount(limit) : null;
    if (limit.trim() && !value) return setError(errorMessage("bad_limit"));
    void call("set_deposit_limit", { p_limit: value }, value ? `Límite guardado: ${usdt(value)} cada 24 horas.` : "Límite eliminado.");
  }

  function exclude() {
    const option = EXCLUSIONS.find((item) => item.days === days)!;
    if (!window.confirm(`Tu cuenta quedará bloqueada durante ${option.label}. No se puede deshacer ni acortar. ¿Continuar?`)) return;
    void call("self_exclude", { p_days: days }, "Autoexclusión activada.");
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1>Mi cuenta</h1>
      <section className="card flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{profile?.name || "Sin nombre"}</p>
          <p className="truncate text-sm text-muted">{session?.user.email}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/cartera" className="btn">
            Cartera
          </Link>
          <button type="button" className="btn btn-danger" onClick={() => supabase().auth.signOut()}>
            Salir
          </button>
        </div>
      </section>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <section className="card flex flex-col gap-3">
        <h2>Límite de depósito</h2>
        <p className="text-sm text-muted">Pon un tope a lo que puedes depositar cada 24 horas. Déjalo vacío para no tener tope.</p>
        <div className="flex gap-2">
          <input className="input tabular" inputMode="decimal" placeholder="Sin límite" value={limit} onChange={(event) => setLimit(event.target.value)} />
          <button type="button" className="btn btn-primary" disabled={busy} onClick={saveLimit}>
            Guardar
          </button>
        </div>
      </section>

      <section className="card flex flex-col gap-3">
        <h2>Autoexclusión</h2>
        {excludedUntil ? (
          <p className="warn">Tu cuenta está bloqueada hasta el {dateTime(excludedUntil)}. Puedes retirar tu saldo, pero no apostar, jugar ni depositar.</p>
        ) : (
          <>
            <p className="text-sm text-muted">
              Si sientes que el juego dejó de ser un entretenimiento, bloquea tu cuenta por un tiempo. Mientras dure no podrás apostar, jugar ni
              depositar; sí podrás retirar tu saldo. No se puede cancelar antes de tiempo.
            </p>
            <div className="flex flex-wrap gap-2">
              {EXCLUSIONS.map((option) => (
                <button key={option.days} type="button" className={`chip ${days === option.days ? "chip-on" : ""}`} onClick={() => setDays(option.days)}>
                  {option.label}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-danger self-start" disabled={busy} onClick={exclude}>
              Bloquear mi cuenta
            </button>
          </>
        )}
      </section>
    </div>
  );
}

export default function AccountPage() {
  return (
    <RequireSession>
      <Account />
    </RequireSession>
  );
}
