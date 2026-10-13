import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, Empty, ErrorText, Field, Line, Muted, Notice, Row, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { errorCode } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { odds as formatOdds, parseAmount, usdt } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useAccount } from '@/store/account';
import { slip, useSlip } from '@/store/slip';

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Reads the current price of every pick; picks that can no longer be bet on come back without one. */
async function currentPrices(ids: string[]) {
  const { data } = await supabase.from('odds').select('id, price, active, events(status, commence_time)').in('id', ids);
  const prices = new Map<string, number>();
  for (const row of data ?? []) {
    // The embed is one event per odd; depending on the client's inference it may be typed as a list.
    const event = (Array.isArray(row.events) ? row.events[0] : row.events) as { status: string; commence_time: string } | null;
    if (row.active && event?.status === 'upcoming' && new Date(event.commence_time) > new Date()) prices.set(row.id, Number(row.price));
  }
  return prices;
}

export default function SlipScreen() {
  const selections = useSlip();
  const { balance, setBalance, settings } = useAccount();
  const [stake, setStake] = useState('10');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const totalOdds = round2(selections.reduce((total, item) => total * item.price, 1));
  const amount = parseAmount(stake);
  const payout = amount ? round2(amount * totalOdds) : 0;
  const problem = !amount
    ? 'Escribe cuánto quieres apostar.'
    : amount < settings.min_bet || amount > settings.max_bet
      ? `La apuesta va de ${usdt(settings.min_bet)} a ${usdt(settings.max_bet)}.`
      : payout > settings.max_payout
        ? `El premio máximo por apuesta es ${usdt(settings.max_payout)}.`
        : selections.length > settings.max_selections
          ? `Máximo ${settings.max_selections} selecciones por boleto.`
          : amount > balance
            ? 'No tienes saldo suficiente.'
            : '';

  async function place() {
    if (!amount) return;
    setError('');
    setBusy(true);
    const { data, error } = await supabase.rpc('place_bet', {
      p_stake: amount,
      p_selections: selections.map((item) => ({ odds_id: item.oddsId, price: item.price })),
    });
    if (error) {
      const code = errorCode(error);
      // The slip is brought up to date so the user confirms the prices that are really on offer.
      if (code === 'odds_changed' || code === 'selection_closed') slip.reprice(await currentPrices(selections.map((item) => item.oddsId)));
      setError(errorMessage(code));
    } else {
      setBalance(Number(data.balance));
      slip.clear();
      setNotice(`¡Apuesta registrada! Si aciertas cobras ${usdt(Number(data.potential_payout))}.`);
    }
    setBusy(false);
  }

  if (selections.length === 0) {
    return (
      <Screen>
        <Notice>{notice}</Notice>
        <Empty icon="receipt" text="Tu boleto está vacío. Toca una cuota para agregarla; con varias armas una combinada." />
        <Button label={notice ? 'Ver mis apuestas' : 'Ver partidos'} onPress={() => router.replace(notice ? '/apuestas' : '/deportes')} />
      </Screen>
    );
  }

  return (
    <Screen>
      {selections.map((item) => (
        <View
          key={item.oddsId}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.two,
            backgroundColor: Colors.surface,
            borderColor: Colors.border,
            borderWidth: 1,
            borderRadius: Radius.medium,
            padding: Spacing.three,
          }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: Colors.text, fontWeight: '600' }} numberOfLines={1}>
              {item.pick}
            </Text>
            <Muted style={{ fontSize: 12 }}>{item.eventName}</Muted>
          </View>
          <Text style={{ color: Colors.accent, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatOdds(item.price)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Quitar" hitSlop={10} onPress={() => slip.remove(item.oddsId)}>
            <Ionicons name="close" size={20} color={Colors.textSecondary} />
          </Pressable>
        </View>
      ))}

      <Card>
        <Field label="Importe (USDT)" numeric value={stake} onChangeText={setStake} />
        <Row>
          {[5, 10, 25, 50].map((value) => (
            <Button key={value} variant="secondary" label={String(value)} onPress={() => setStake(String(value))} style={{ flex: 1, minHeight: 38 }} />
          ))}
        </Row>
        <Line label={selections.length > 1 ? `Combinada de ${selections.length}` : 'Apuesta simple'} value={formatOdds(totalOdds)} />
        <Line strong label="Posible premio" value={usdt(payout)} tone="good" />
        <ErrorText>{error}</ErrorText>
        {problem ? <Muted style={{ color: Colors.gold }}>{problem}</Muted> : null}
        <Button label={`Apostar ${amount ? usdt(amount) : ''}`} onPress={place} loading={busy} disabled={Boolean(problem)} />
        <Button variant="secondary" label="Vaciar boleto" onPress={slip.clear} />
      </Card>
    </Screen>
  );
}
