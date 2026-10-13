import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { kickoff, odds as formatOdds } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { MARKET_LABELS, pickLabel, type Market, type Odd, type Sport, type SportEvent } from '@/lib/types';
import { slip, useSlip } from '@/store/slip';

const OUTCOME_ORDER = ['home', 'draw', 'away', 'over', 'under'];
const MARKETS: Market[] = ['h2h', 'totals'];

/** Sports and the events that can still be bet on, refreshed every minute and when the app comes back to the front. */
export function useEvents() {
  const [state, setState] = useState<{ sports: Sport[]; events: SportEvent[]; loading: boolean; error: boolean }>({
    sports: [],
    events: [],
    loading: true,
    error: false,
  });

  const load = useCallback(async () => {
    const [sports, events] = await Promise.all([
      supabase.from('sports').select('key, title, group_name, sort').eq('active', true).order('sort'),
      supabase
        .from('events')
        .select('id, sport_key, home_team, away_team, commence_time, odds(id, event_id, market, outcome, point, price, active)')
        .eq('status', 'upcoming')
        .gt('commence_time', new Date().toISOString())
        .order('commence_time')
        .limit(300),
    ]);
    if (sports.error || events.error) return setState((old) => ({ ...old, loading: false, error: true }));
    const open = (events.data as SportEvent[])
      .map((event) => ({ ...event, odds: event.odds.filter((odd) => odd.active) }))
      .filter((event) => event.odds.length > 0);
    setState({ sports: sports.data as Sport[], events: open, loading: false, error: false });
  }, []);

  useEffect(() => {
    // Deferred a tick: the loader sets state, which an effect body must not do synchronously.
    Promise.resolve().then(load);
    const timer = setInterval(load, 60_000);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void load();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [load]);

  return { ...state, reload: load };
}

function OddsButton({ event, odd, selected }: { event: SportEvent; odd: Odd; selected: boolean }) {
  const label = pickLabel({ ...odd, home_team: event.home_team, away_team: event.away_team });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, cuota ${formatOdds(Number(odd.price))}`}
      onPress={() =>
        slip.toggle({
          oddsId: odd.id,
          eventId: event.id,
          price: Number(odd.price),
          eventName: `${event.home_team} vs ${event.away_team}`,
          pick: `${MARKET_LABELS[odd.market]} · ${label}`,
        })
      }
      style={[styles.odd, selected && styles.oddSelected]}>
      <Text style={[styles.oddLabel, selected && { color: Colors.background }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.oddPrice, selected && { color: Colors.background }]}>{formatOdds(Number(odd.price))}</Text>
    </Pressable>
  );
}

export function EventCard({ event, sport }: { event: SportEvent; sport?: Sport }) {
  const selections = useSlip();
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.team} numberOfLines={1}>
            {event.home_team}
          </Text>
          <Text style={styles.team} numberOfLines={1}>
            {event.away_team}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {sport && <Text style={styles.league}>{sport.title}</Text>}
          <Text style={styles.time}>{kickoff(event.commence_time)}</Text>
        </View>
      </View>
      {MARKETS.map((market) => {
        const odds = event.odds
          .filter((odd) => odd.market === market)
          .sort((a, b) => OUTCOME_ORDER.indexOf(a.outcome) - OUTCOME_ORDER.indexOf(b.outcome));
        if (odds.length === 0) return null;
        return (
          <View key={market} style={styles.market}>
            {odds.map((odd) => (
              <OddsButton key={odd.id} event={event} odd={odd} selected={selections.some((item) => item.oddsId === odd.id)} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

/** Floating bar that opens the bet slip; only there while the slip has picks. */
export function SlipBar() {
  const selections = useSlip();
  if (selections.length === 0) return null;
  const total = selections.reduce((product, item) => product * item.price, 1);
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/boleto')} style={styles.slipBar}>
      <Text style={styles.slipText}>
        Boleto · {selections.length} {selections.length === 1 ? 'selección' : 'selecciones'}
      </Text>
      <Text style={styles.slipText}>Cuota {formatOdds(total)} ›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  header: { flexDirection: 'row', gap: Spacing.three, marginBottom: Spacing.one },
  team: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  league: { color: Colors.accent, fontSize: 12, fontWeight: '700' },
  time: { color: Colors.textSecondary, fontSize: 12 },
  market: { flexDirection: 'row', gap: Spacing.two },
  odd: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.small,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceRaised,
  },
  oddSelected: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  oddLabel: { flex: 1, color: Colors.textSecondary, fontSize: 13 },
  oddPrice: { color: Colors.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  slipBar: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.three,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    backgroundColor: Colors.accent,
  },
  slipText: { color: Colors.background, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
