import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Card, Chips, Empty, ErrorText, Field, Heading, ListItem, Muted, Notice, Row, Screen, Select } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorCode } from '@/lib/api';
import { COINS, coinName } from '@/lib/crypto';
import { errorMessage } from '@/lib/errors';
import { dateTime, money, parseAmount, usdt } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import {
  DEPOSIT_STATUS_LABELS,
  LEDGER_LABELS,
  WITHDRAWAL_STATUS_LABELS,
  type Deposit,
  type LedgerEntry,
  type Withdrawal,
} from '@/lib/types';
import { useAccount } from '@/store/account';

type Tab = 'depositar' | 'retirar' | 'movimientos';
const COIN_OPTIONS = COINS.map((coin) => ({ value: coin.id as string, label: coinName(coin.id) }));

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <View style={{ gap: Spacing.one }}>
      <Muted style={{ fontSize: 13 }}>{label}</Muted>
      <Row>
        <Text
          selectable
          style={{
            flex: 1,
            color: Colors.text,
            backgroundColor: Colors.background,
            borderColor: Colors.border,
            borderWidth: 1,
            borderRadius: Radius.small,
            padding: Spacing.two,
            fontVariant: ['tabular-nums'],
          }}>
          {value}
        </Text>
        <Button
          variant="secondary"
          label={copied ? '✓' : 'Copiar'}
          onPress={async () => {
            await Clipboard.setStringAsync(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        />
      </Row>
    </View>
  );
}

/** Payment instructions of a deposit, re-checked against the processor until it is credited. */
function DepositDetail({ deposit, onChange }: { deposit: Deposit; onChange: (deposit: Deposit) => void }) {
  const { reload } = useAccount();
  const open = deposit.status === 'waiting' || deposit.status === 'confirming';

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(async () => {
      try {
        const { deposit: fresh } = await api<{ deposit: Deposit }>(`/api/wallet/deposit?id=${deposit.id}`);
        if (fresh.status !== deposit.status) {
          onChange(fresh);
          if (fresh.status === 'credited') void reload();
        }
      } catch {
        // The next tick tries again.
      }
    }, 15_000);
    return () => clearInterval(timer);
  }, [deposit.id, deposit.status, open, onChange, reload]);

  if (deposit.status === 'credited') return <Notice>¡Depósito acreditado! Se sumaron {usdt(Number(deposit.credited))} a tu saldo.</Notice>;
  if (!open) return <ErrorText>Este depósito {deposit.status === 'expired' ? 'expiró' : 'falló'}. Crea uno nuevo.</ErrorText>;

  return (
    <Card style={{ borderColor: Colors.accentDeep }}>
      <Muted>
        Envía exactamente este importe por la red {coinName(deposit.pay_currency)}. Enviar otra moneda u otra red puede hacer que pierdas los fondos.
      </Muted>
      <CopyRow label="Importe" value={String(deposit.pay_amount ?? '')} />
      <CopyRow label="Dirección" value={deposit.pay_address ?? ''} />
      <Notice tone="warn">{DEPOSIT_STATUS_LABELS[deposit.status]}… Se acredita solo al confirmarse en la red; puedes salir de esta pantalla.</Notice>
    </Card>
  );
}

export default function WalletScreen() {
  const { balance, setBalance, settings, profile } = useAccount();
  const [tab, setTab] = useState<Tab>('depositar');
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [current, setCurrent] = useState<Deposit | null>(null);
  const [amount, setAmount] = useState('50');
  const [coin, setCoin] = useState('usdttrc20');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [d, w, l] = await Promise.all([
      supabase.from('deposits').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('withdrawals').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('ledger').select('id, amount, balance_after, kind, created_at').order('id', { ascending: false }).limit(50),
    ]);
    setDeposits((d.data as Deposit[]) ?? []);
    setWithdrawals((w.data as Withdrawal[]) ?? []);
    setLedger((l.data as LedgerEntry[]) ?? []);
  }, []);

  // Reloads the lists whenever the balance moves (a bet, a credited deposit…).
  useEffect(() => {
    Promise.resolve().then(load);
  }, [balance, load]);

  const updateDeposit = useCallback((deposit: Deposit) => {
    setCurrent(deposit);
    setDeposits((old) => old.map((item) => (item.id === deposit.id ? deposit : item)));
  }, []);

  async function run(action: () => Promise<void>) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setError(errorMessage(errorCode(error)));
    }
    setBusy(false);
  }

  function deposit() {
    const value = parseAmount(amount);
    if (!value || value < settings.min_deposit) return setError(`El depósito mínimo es ${usdt(settings.min_deposit)}.`);
    void run(async () => {
      const { deposit } = await api<{ deposit: Deposit }>('/api/wallet/deposit', { amount: value, currency: coin });
      setCurrent(deposit);
      setDeposits((old) => [deposit, ...old]);
    });
  }

  function withdraw() {
    const value = parseAmount(withdrawAmount);
    if (!value || value < settings.min_withdrawal) return setError(`El retiro mínimo es ${usdt(settings.min_withdrawal)}.`);
    if (value > balance) return setError(errorMessage('insufficient_funds'));
    void run(async () => {
      const { error } = await supabase.rpc('request_withdrawal', { p_amount: value, p_network: coin, p_address: address.trim() });
      if (error) throw error;
      setWithdrawAmount('');
      setAddress('');
      setBalance(Math.round((balance - value) * 100) / 100);
      setNotice('Retiro solicitado. Lo revisamos y enviamos a tu dirección; verás el estado aquí.');
    });
  }

  const excluded = Boolean(profile?.excluded_until && new Date(profile.excluded_until) > new Date());

  return (
    <Screen onRefresh={load}>
      <Card>
        <Muted>Saldo disponible</Muted>
        <Text style={{ color: Colors.text, fontSize: 34, fontWeight: '900', fontVariant: ['tabular-nums'] }}>
          {money(balance)} <Text style={{ color: Colors.textSecondary, fontSize: 16 }}>USDT</Text>
        </Text>
      </Card>

      <Chips
        fill
        value={tab}
        onChange={(next) => {
          setTab(next);
          setError('');
          setNotice('');
        }}
        options={[
          { value: 'depositar', label: 'Depositar' },
          { value: 'retirar', label: 'Retirar' },
          { value: 'movimientos', label: 'Movimientos' },
        ]}
      />
      <ErrorText>{error}</ErrorText>
      <Notice>{notice}</Notice>

      {tab === 'depositar' && (
        <>
          {excluded ? (
            <Notice tone="warn">Tu cuenta está en autoexclusión: no puedes depositar por ahora.</Notice>
          ) : (
            <Card>
              <Heading>Depositar con cripto</Heading>
              <Field label="Importe a acreditar (USD)" numeric value={amount} onChangeText={setAmount} />
              <Select label="Moneda y red" options={COIN_OPTIONS} value={coin} onChange={setCoin} />
              <Muted style={{ fontSize: 12 }}>
                Mínimo {usdt(settings.min_deposit)}. Tu saldo se lleva en USDT (1 USDT = 1 USD); si pagas con otra moneda se convierte al tipo de cambio
                del momento.
              </Muted>
              <Button label="Obtener dirección de pago" onPress={deposit} loading={busy} />
            </Card>
          )}
          {current && <DepositDetail deposit={current} onChange={updateDeposit} />}
          {deposits.length > 0 && <Heading>Depósitos recientes</Heading>}
          {deposits.map((item) => (
            <ListItem
              key={item.id}
              title={`${usdt(Number(item.amount))} · ${coinName(item.pay_currency)}`}
              subtitle={dateTime(item.created_at)}
              value={DEPOSIT_STATUS_LABELS[item.status]}
              tone={item.status === 'credited' ? 'good' : item.status === 'waiting' || item.status === 'confirming' ? 'warn' : 'muted'}
              onPress={() => setCurrent(item)}
            />
          ))}
        </>
      )}

      {tab === 'retirar' && (
        <>
          <Card>
            <Heading>Retirar a tu wallet</Heading>
            <Field label="Importe (USDT)" numeric value={withdrawAmount} onChangeText={setWithdrawAmount} />
            <Select label="Moneda y red" options={COIN_OPTIONS} value={coin} onChange={setCoin} />
            <Field label="Dirección de tu wallet" value={address} onChangeText={setAddress} autoCapitalize="none" autoCorrect={false} maxLength={120} />
            <Muted style={{ fontSize: 12 }}>
              Mínimo {usdt(settings.min_withdrawal)}. El importe sale de tu saldo al solicitarlo y se envía tras una revisión; si se rechaza, vuelve a tu
              saldo. Revisa bien la dirección y la red: un envío a una dirección equivocada no se puede recuperar.
            </Muted>
            <Button label="Solicitar retiro" onPress={withdraw} loading={busy} />
          </Card>
          {withdrawals.map((item) => (
            <ListItem
              key={item.id}
              title={`${usdt(Number(item.amount))} · ${coinName(item.network)}`}
              subtitle={[dateTime(item.created_at), item.tx_hash ? `Tx: ${item.tx_hash}` : item.note].filter(Boolean).join(' · ')}
              value={WITHDRAWAL_STATUS_LABELS[item.status]}
              tone={item.status === 'paid' ? 'good' : item.status === 'pending' ? 'warn' : 'bad'}
            />
          ))}
        </>
      )}

      {tab === 'movimientos' &&
        (ledger.length === 0 ? (
          <Empty icon="swap-vertical" text="Todavía no hay movimientos." />
        ) : (
          ledger.map((entry) => (
            <ListItem
              key={entry.id}
              title={LEDGER_LABELS[entry.kind] ?? entry.kind}
              subtitle={dateTime(entry.created_at)}
              value={`${Number(entry.amount) >= 0 ? '+' : '−'}${money(Math.abs(Number(entry.amount)))}`}
              valueHint={`Saldo ${money(Number(entry.balance_after))}`}
              tone={Number(entry.amount) >= 0 ? 'good' : undefined}
            />
          ))
        ))}
    </Screen>
  );
}
