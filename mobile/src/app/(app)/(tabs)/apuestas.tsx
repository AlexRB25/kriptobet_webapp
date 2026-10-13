import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Card, Chips, Empty, Line, ListItem, Muted, Row, Screen } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { dateTime, kickoff, money, odds, usdt } from '@/lib/format';
import { GAMES, type GameId } from '@/lib/games';
import { supabase } from '@/lib/supabase';
import { BET_STATUS_LABELS, MARKET_LABELS, pickLabel, type Bet, type BetStatus, type GameRound } from '@/lib/types';
import { useAccount } from '@/store/account';

const STATUS_COLORS: Record<BetStatus, string> = { pending: Colors.gold, won: Colors.accent, lost: Colors.textSecondary, void: Colors.text };

function BetCard({ bet }: { bet: Bet }) {
  const combined = bet.bet_selections.length > 1;
  return (
    <Card style={{ gap: Spacing.two }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Muted>
          {combined ? `Combinada de ${bet.bet_selections.length}` : 'Simple'} · {dateTime(bet.created_at)}
        </Muted>
        <Text style={{ color: STATUS_COLORS[bet.status], fontWeight: '700' }}>{BET_STATUS_LABELS[bet.status]}</Text>
      </Row>
      {bet.bet_selections.map((selection) => (
        <View key={selection.id} style={{ backgroundColor: Colors.surfaceRaised, borderRadius: Radius.small, padding: Spacing.two, gap: Spacing.half }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ color: Colors.text, fontWeight: '600', flex: 1 }} numberOfLines={1}>
              {MARKET_LABELS[selection.market]} · {pickLabel(selection)}
            </Text>
            <Text style={{ color: Colors.text, fontVariant: ['tabular-nums'] }}>{odds(Number(selection.price))}</Text>
          </Row>
          <Muted style={{ fontSize: 12 }}>
            {selection.home_team} vs {selection.away_team} · {kickoff(selection.commence_time)}
            {combined && selection.status !== 'pending' ? ` · ${BET_STATUS_LABELS[selection.status]}` : ''}
          </Muted>
        </View>
      ))}
      <Muted>
        Apostado {usdt(Number(bet.stake))} · cuota {odds(Number(bet.total_odds))}
      </Muted>
      {bet.status === 'pending' ? (
        <Line strong label="Posible premio" value={usdt(Number(bet.potential_payout))} />
      ) : (
        <Line strong label={bet.status === 'void' ? 'Devuelto' : 'Cobrado'} value={usdt(Number(bet.payout))} tone={Number(bet.payout) > 0 ? 'good' : undefined} />
      )}
    </Card>
  );
}

export default function HistoryScreen() {
  const { balance } = useAccount();
  const [tab, setTab] = useState<'deportes' | 'casino'>('deportes');
  const [bets, setBets] = useState<Bet[] | null>(null);
  const [rounds, setRounds] = useState<GameRound[] | null>(null);

  const load = useCallback(async () => {
    const [sports, casino] = await Promise.all([
      supabase.from('bets').select('*, bet_selections(*)').order('created_at', { ascending: false }).limit(50),
      supabase.from('game_rounds').select('id, game, bet, payout, status, created_at').order('created_at', { ascending: false }).limit(100),
    ]);
    setBets((sports.data as Bet[]) ?? []);
    setRounds((casino.data as GameRound[]) ?? []);
  }, []);

  // The balance changes with every bet, round and settlement, so it doubles as the reload signal.
  useEffect(() => {
    Promise.resolve().then(load);
  }, [balance, load]);

  return (
    <Screen onRefresh={load}>
      <Chips
        fill
        value={tab}
        onChange={setTab}
        options={[
          { value: 'deportes', label: 'Deportes' },
          { value: 'casino', label: 'Casino' },
        ]}
      />
      {tab === 'deportes' &&
        (bets?.length === 0 ? <Empty icon="football" text="Todavía no has hecho apuestas deportivas." /> : bets?.map((bet) => <BetCard key={bet.id} bet={bet} />))}
      {tab === 'casino' &&
        (rounds?.length === 0 ? (
          <Empty icon="dice" text="Todavía no has jugado en el casino." />
        ) : (
          rounds?.map((round) => {
            const net = Number(round.payout) - Number(round.bet);
            const game = GAMES[round.game as GameId];
            return (
              <ListItem
                key={round.id}
                left={<Text style={{ fontSize: 26 }}>{game?.emoji}</Text>}
                title={game?.title ?? round.game}
                subtitle={dateTime(round.created_at)}
                value={round.status === 'open' ? 'En curso' : `${net >= 0 ? '+' : '−'}${money(Math.abs(net))}`}
                valueHint={`Apuesta ${money(Number(round.bet))}`}
                tone={round.status === 'open' ? 'warn' : net > 0 ? 'good' : net < 0 ? 'muted' : undefined}
              />
            );
          })
        ))}
    </Screen>
  );
}
