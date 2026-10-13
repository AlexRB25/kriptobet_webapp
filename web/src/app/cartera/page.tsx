"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { RequireSession } from "@/components/require-session";
import { useAccount } from "@/lib/account";
import { api, errorCode } from "@/lib/api";
import { COINS, coinName } from "@/lib/crypto";
import { errorMessage } from "@/lib/errors";
import { dateTime, money, parseAmount, usdt } from "@/lib/format";
import { demoMode, supabase } from "@/lib/supabase";
import {
  DEPOSIT_STATUS_LABELS,
  LEDGER_LABELS,
  WITHDRAWAL_STATUS_LABELS,
  type Deposit,
  type LedgerEntry,
  type Withdrawal,
} from "@/lib/types";

type Tab = "depositar" | "retirar" | "movimientos";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="flex gap-2">
        <code className="input tabular flex-1 overflow-x-auto whitespace-nowrap">{value}</code>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}>
          {copied ? "✓" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

/** Payment instructions of a deposit, re-checked against the processor until it is credited. */
function DepositDetail({ deposit, onChange }: { deposit: Deposit; onChange: (deposit: Deposit) => void }) {
  const { refresh } = useAccount();
  const [qr, setQr] = useState("");
  const open = deposit.status === "waiting" || deposit.status === "confirming";

  useEffect(() => {
    if (!deposit.pay_address) return;
    let cancelled = false;
    QRCode.toDataURL(deposit.pay_address, { margin: 1, width: 180 }).then((url) => !cancelled && setQr(url), () => {});
    return () => {
      cancelled = true;
    };
  }, [deposit.pay_address]);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(async () => {
      try {
        const { deposit: fresh } = await api<{ deposit: Deposit }>(`/api/wallet/deposit?id=${deposit.id}`);
        if (fresh.status !== deposit.status) {
          onChange(fresh);
          if (fresh.status === "credited") void refresh();
        }
      } catch {
        // The next tick tries again.
      }
    }, 15_000);
    return () => clearInterval(timer);
  }, [deposit.id, deposit.status, open, onChange, refresh]);

  if (deposit.status === "credited") return <p className="notice">¡Depósito acreditado! Se sumaron {usdt(Number(deposit.credited))} a tu saldo.</p>;
  if (!open) return <p className="error">Este depósito {deposit.status === "expired" ? "expiró" : "falló"}. Crea uno nuevo.</p>;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-brand/40 bg-ink p-4">
      <p className="text-sm">
        Envía <b>exactamente</b> este importe por la red <b>{coinName(deposit.pay_currency)}</b>. Enviar otra moneda u otra red puede hacer que pierdas
        los fondos.
      </p>
      <div className="flex flex-col gap-4 sm:flex-row">
        {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL generated in the browser */}
        {qr && <img src={qr} alt="Código QR de la dirección" width={180} height={180} className="self-center rounded-lg" />}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <CopyRow label="Importe" value={String(deposit.pay_amount ?? "")} />
          <CopyRow label="Dirección" value={deposit.pay_address ?? ""} />
          <p className="warn">
            {DEPOSIT_STATUS_LABELS[deposit.status]}… Se acredita solo al confirmarse en la red; puedes cerrar esta página.
          </p>
        </div>
      </div>
    </div>
  );
}

function Wallet() {
  const { session, balance, setBalance, settings, profile } = useAccount();
  const [tab, setTab] = useState<Tab>("depositar");
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [current, setCurrent] = useState<Deposit | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const userId = session?.user.id;

  const load = useCallback(async () => {
    const [d, w, l] = await Promise.all([
      supabase().from("deposits").select("*").order("created_at", { ascending: false }).limit(10),
      supabase().from("withdrawals").select("*").order("created_at", { ascending: false }).limit(10),
      supabase().from("ledger").select("id, amount, balance_after, kind, created_at").order("id", { ascending: false }).limit(50),
    ]);
    setDeposits((d.data as Deposit[]) ?? []);
    setWithdrawals((w.data as Withdrawal[]) ?? []);
    setLedger((l.data as LedgerEntry[]) ?? []);
  }, []);

  // Reloads the lists whenever the balance moves (a bet, a credited deposit…).
  useEffect(() => {
    if (userId) Promise.resolve().then(load);
  }, [userId, balance, load]);

  const updateDeposit = useCallback((deposit: Deposit) => {
    setCurrent(deposit);
    setDeposits((old) => old.map((item) => (item.id === deposit.id ? deposit : item)));
  }, []);

  async function run(action: () => Promise<void>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setError(errorMessage(errorCode(error)));
    }
    setBusy(false);
  }

  function deposit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const amount = parseAmount(form.amount);
    if (!amount || amount < settings.min_deposit) return setError(`El depósito mínimo es ${usdt(settings.min_deposit)}.`);
    void run(async () => {
      const { deposit } = await api<{ deposit: Deposit }>("/api/wallet/deposit", { amount, currency: form.currency });
      setCurrent(deposit);
      setDeposits((old) => [deposit, ...old]);
    });
  }

  function withdraw(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = Object.fromEntries(new FormData(target)) as Record<string, string>;
    const amount = parseAmount(form.amount);
    if (!amount || amount < settings.min_withdrawal) return setError(`El retiro mínimo es ${usdt(settings.min_withdrawal)}.`);
    if (amount > balance) return setError(errorMessage("insufficient_funds"));
    void run(async () => {
      const { error } = await supabase().rpc("request_withdrawal", { p_amount: amount, p_network: form.network, p_address: form.address.trim() });
      if (error) throw error;
      target.reset();
      setBalance(Math.round((balance - amount) * 100) / 100);
      setNotice("Retiro solicitado. Lo revisamos y enviamos a tu dirección; verás el estado aquí.");
    });
  }

  const excluded = profile?.excluded_until && new Date(profile.excluded_until) > new Date();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1>Cartera</h1>
      <section className="card glow flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Saldo disponible</p>
          <p className="tabular text-3xl font-black">
            {money(balance)} <span className="text-base font-semibold text-muted">USDT</span>
          </p>
        </div>
        {demoMode && balance < 1 && (
          <button
            type="button"
            className="btn btn-gold"
            disabled={busy}
            onClick={() => run(async () => setBalance((await api<{ balance: number }>("/api/wallet/demo", {})).balance))}>
            Recargar saldo de prueba
          </button>
        )}
      </section>
      {demoMode && <p className="warn">Modo demo activo: el saldo de prueba no es dinero real y no se puede retirar.</p>}

      <div className="flex gap-2">
        {(["depositar", "retirar", "movimientos"] as Tab[]).map((item) => (
          <button
            key={item}
            type="button"
            className={`chip capitalize ${tab === item ? "chip-on" : ""}`}
            onClick={() => {
              setTab(item);
              setError("");
              setNotice("");
            }}>
            {item}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {tab === "depositar" && (
        <>
          {excluded ? (
            <p className="warn">Tu cuenta está en autoexclusión: no puedes depositar por ahora.</p>
          ) : (
            <form onSubmit={deposit} className="card flex flex-col gap-3">
              <h2>Depositar con cripto</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="label">
                  Importe a acreditar (USD)
                  <input name="amount" className="input tabular" inputMode="decimal" defaultValue="50" required />
                </label>
                <label className="label">
                  Moneda y red
                  <select name="currency" className="input" defaultValue="usdttrc20">
                    {COINS.map((coin) => (
                      <option key={coin.id} value={coin.id}>
                        {coinName(coin.id)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-xs text-muted">
                Mínimo {usdt(settings.min_deposit)}. Tu saldo se lleva en USDT (1 USDT = 1 USD); si pagas con otra moneda se convierte al tipo de cambio
                del momento.
              </p>
              <button className="btn btn-primary btn-lg" disabled={busy}>
                {busy ? "Generando dirección…" : "Obtener dirección de pago"}
              </button>
            </form>
          )}
          {current && <DepositDetail deposit={current} onChange={updateDeposit} />}
          {deposits.length > 0 && (
            <section className="card flex flex-col gap-2">
              <h2>Depósitos recientes</h2>
              {deposits.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-raised px-3 py-2 text-left text-sm hover:brightness-125"
                  onClick={() => setCurrent(item)}>
                  <span>
                    <b className="tabular">{usdt(Number(item.amount))}</b> · {coinName(item.pay_currency)}
                    <span className="block text-xs text-muted">{dateTime(item.created_at)}</span>
                  </span>
                  <span className={item.status === "credited" ? "text-brand" : item.status === "waiting" || item.status === "confirming" ? "text-gold" : "text-muted"}>
                    {DEPOSIT_STATUS_LABELS[item.status]}
                  </span>
                </button>
              ))}
            </section>
          )}
        </>
      )}

      {tab === "retirar" && (
        <>
          <form onSubmit={withdraw} className="card flex flex-col gap-3">
            <h2>Retirar a tu wallet</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="label">
                Importe (USDT)
                <input name="amount" className="input tabular" inputMode="decimal" required />
              </label>
              <label className="label">
                Moneda y red
                <select name="network" className="input" defaultValue="usdttrc20">
                  {COINS.map((coin) => (
                    <option key={coin.id} value={coin.id}>
                      {coinName(coin.id)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="label">
              Dirección de tu wallet
              <input name="address" className="input" required minLength={20} maxLength={120} autoComplete="off" spellCheck={false} />
            </label>
            <p className="text-xs text-muted">
              Mínimo {usdt(settings.min_withdrawal)}. El importe sale de tu saldo al solicitarlo y se envía tras una revisión; si se rechaza, vuelve a
              tu saldo. Revisa bien la dirección y la red: un envío a una dirección equivocada no se puede recuperar.
            </p>
            <button className="btn btn-primary btn-lg" disabled={busy}>
              {busy ? "Enviando…" : "Solicitar retiro"}
            </button>
          </form>
          {withdrawals.length > 0 && (
            <section className="card flex flex-col gap-2">
              <h2>Tus retiros</h2>
              {withdrawals.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-raised px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <b className="tabular">{usdt(Number(item.amount))}</b> · {coinName(item.network)}
                    <span className="block truncate text-xs text-muted">
                      {dateTime(item.created_at)} · {item.address}
                    </span>
                    {item.tx_hash && <span className="block truncate text-xs text-muted">Tx: {item.tx_hash}</span>}
                    {item.note && <span className="block text-xs text-muted">{item.note}</span>}
                  </span>
                  <span className={item.status === "paid" ? "text-brand" : item.status === "pending" ? "text-gold" : "text-bad"}>
                    {WITHDRAWAL_STATUS_LABELS[item.status]}
                  </span>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {tab === "movimientos" && (
        <section className="card flex flex-col gap-1">
          {ledger.length === 0 && <p className="text-sm text-muted">Todavía no hay movimientos.</p>}
          {ledger.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 border-b border-line py-2 text-sm last:border-0">
              <span>
                {LEDGER_LABELS[entry.kind] ?? entry.kind}
                <span className="block text-xs text-muted">{dateTime(entry.created_at)}</span>
              </span>
              <span className="tabular text-right">
                <b className={Number(entry.amount) >= 0 ? "text-brand" : ""}>
                  {Number(entry.amount) >= 0 ? "+" : "−"}
                  {money(Math.abs(Number(entry.amount)))}
                </b>
                <span className="block text-xs text-muted">Saldo {money(Number(entry.balance_after))}</span>
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export default function WalletPage() {
  return (
    <RequireSession>
      <Wallet />
    </RequireSession>
  );
}
