import { useCallback, useState, type PropsWithChildren, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, ErrorText, Field, Muted, Row, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, errorCode } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { money, parseAmount, usdt } from '@/lib/format';
import type { GameId, GameResponse } from '@/lib/games';
import { useAccount } from '@/store/account';

// Pieces shared by the six game screens.

/** Sends moves to a game's endpoint on the web server and keeps the balance in step with the answers. */
export function usePlay<State>(game: GameId) {
  const { setBalance } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /** `deferBalance` is for games that animate the outcome: they call `setBalance` when the animation ends. */
  const send = useCallback(
    async (body: unknown, deferBalance = false): Promise<GameResponse<State> | null> => {
      setError('');
      setBusy(true);
      try {
        const response = await api<GameResponse<State>>(`/api/games/${game}`, body);
        if (!deferBalance) setBalance(response.balance);
        return response;
      } catch (error) {
        setError(errorMessage(errorCode(error)));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [game, setBalance],
  );

  return { busy, error, send };
}

/** Bet amount typed by the player, with its validation message. */
export function useBet(initial = '1') {
  const { settings, balance } = useAccount();
  const [text, setText] = useState(initial);
  const amount = parseAmount(text);
  const problem = !amount
    ? 'Escribe tu apuesta.'
    : amount < settings.min_bet || amount > settings.max_bet
      ? `La apuesta va de ${usdt(settings.min_bet)} a ${usdt(settings.max_bet)}.`
      : amount > balance
        ? 'No tienes saldo suficiente.'
        : '';
  return { text, setText, amount: problem ? null : amount, problem };
}

export function BetInput({ bet, disabled }: { bet: ReturnType<typeof useBet>; disabled?: boolean }) {
  const { settings, balance } = useAccount();
  const clamp = (value: number) => String(Math.min(settings.max_bet, Math.max(settings.min_bet, Math.round(value * 100) / 100)));
  const scale = (factor: number) => bet.setText(clamp((parseAmount(bet.text) ?? settings.min_bet) * factor));
  return (
    <View style={{ gap: Spacing.two }}>
      <Field label="Apuesta (USDT)" numeric value={bet.text} onChangeText={bet.setText} editable={!disabled} />
      <Row>
        <Button variant="secondary" label="½" onPress={() => scale(0.5)} disabled={disabled} style={styles.small} />
        <Button variant="secondary" label="2×" onPress={() => scale(2)} disabled={disabled} style={styles.small} />
        <Button variant="secondary" label="Máx" onPress={() => bet.setText(clamp(Math.floor(balance * 100) / 100))} disabled={disabled} style={styles.small} />
      </Row>
      {bet.problem ? <Text style={styles.problem}>{bet.problem}</Text> : null}
    </View>
  );
}

/** Line under the table telling how the last round ended. */
export function Outcome({ payout, bet, pending, idle }: { payout?: number; bet?: number; pending?: boolean; idle?: string }) {
  if (pending || payout === undefined || bet === undefined) return <Text style={[styles.outcome, styles.idle]}>{idle ?? ' '}</Text>;
  return payout > 0 ? (
    <Text style={[styles.outcome, { color: Colors.accent }]}>
      +{money(payout)} USDT{payout === bet ? ' (devuelta)' : ''}
    </Text>
  ) : (
    <Text style={[styles.outcome, { color: Colors.textSecondary }]}>−{money(bet)} USDT</Text>
  );
}

type GameScreenProps = PropsWithChildren<{ controls: ReactNode; rules: string; error?: string }>;

/** Layout of a game: the table on top, the controls under it. */
export function GameScreen({ children, controls, rules, error }: GameScreenProps) {
  const { settings } = useAccount();
  return (
    <Screen>
      <View style={styles.stage}>{children}</View>
      <Card>
        {controls}
        <ErrorText>{error}</ErrorText>
      </Card>
      <Muted style={{ fontSize: 12 }}>
        {rules} Premio máximo por jugada: {usdt(settings.max_payout)}.
      </Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.medium,
  },
  small: { flex: 1, minHeight: 36 },
  problem: { color: Colors.gold, fontSize: 12 },
  outcome: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'], textAlign: 'center' },
  idle: { color: Colors.textSecondary, fontSize: 14, fontWeight: '400' },
});
