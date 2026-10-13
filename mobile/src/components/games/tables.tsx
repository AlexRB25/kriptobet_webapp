import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BetInput, GameScreen, Outcome, useBet, usePlay } from '@/components/game-ui';
import { Button, Chips, Line, Muted, Row } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { money, usdt } from '@/lib/format';
import {
  MINES_TILES,
  rouletteColor,
  type BlackjackOutcome,
  type BlackjackState,
  type Card,
  type MinesState,
  type RouletteBet,
  type RouletteBetType,
  type RouletteState,
} from '@/lib/games';
import { useAccount } from '@/store/account';

// The three table games: ruleta, minas and blackjack.

const round2 = (value: number) => Math.round(value * 100) / 100;

// ───────────── Ruleta ─────────────

const CHIPS = ['0.5', '1', '5', '25'].map((value) => ({ value, label: value }));
const NUMBERS = Array.from({ length: 37 }, (_, index) => index);
const OUTSIDE: { key: string; label: string }[] = [
  { key: 'red', label: 'Rojo' },
  { key: 'black', label: 'Negro' },
  { key: 'even', label: 'Par' },
  { key: 'odd', label: 'Impar' },
  { key: 'low', label: '1–18' },
  { key: 'high', label: '19–36' },
  { key: 'dozen:1', label: '1ª docena' },
  { key: 'dozen:2', label: '2ª docena' },
  { key: 'dozen:3', label: '3ª docena' },
  { key: 'column:1', label: 'Columna 1' },
  { key: 'column:2', label: 'Columna 2' },
  { key: 'column:3', label: 'Columna 3' },
];
const FELT = { red: Colors.red, black: Colors.black, green: Colors.accentDeep };

/** "straight:17" → { type: "straight", value: 17 } */
function toBet(key: string, amount: number): RouletteBet {
  const [type, value] = key.split(':');
  return { type: type as RouletteBetType, ...(value === undefined ? {} : { value: Number(value) }), amount };
}

export function Ruleta() {
  const { balance, setBalance, settings } = useAccount();
  const { busy, error, send } = usePlay<RouletteState>('ruleta');
  const [chip, setChip] = useState('1');
  /** Amount placed on each spot of the felt. */
  const [bets, setBets] = useState<Record<string, number>>({});
  const [shown, setShown] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [last, setLast] = useState<{ payout: number; bet: number } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => () => clearInterval(timer.current), []);

  const total = round2(Object.values(bets).reduce((sum, value) => sum + value, 0));
  const problem =
    total === 0
      ? 'Toca la mesa para poner fichas.'
      : total < settings.min_bet || total > settings.max_bet
        ? `El total va de ${usdt(settings.min_bet)} a ${usdt(settings.max_bet)}.`
        : total > balance
          ? 'No tienes saldo suficiente.'
          : '';

  const place = (key: string) => {
    if (!spinning) setBets((old) => ({ ...old, [key]: round2((old[key] ?? 0) + Number(chip)) }));
  };

  async function spin() {
    if (problem) return;
    setSpinning(true);
    setLast(null);
    timer.current = setInterval(() => setShown(Math.floor(Math.random() * 37)), 80);
    const [response] = await Promise.all([
      send({ bets: Object.entries(bets).map(([key, amount]) => toBet(key, amount)) }, true),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]);
    clearInterval(timer.current);
    setSpinning(false);
    if (!response) return setShown(null);
    setShown(response.state.number);
    setLast({ payout: response.payout, bet: total });
    setBalance(response.balance);
  }

  /** A spot of the felt with the chips on it. */
  const spot = (key: string, label: string, color: string, wide = false) => (
    <Pressable key={key} accessibilityRole="button" accessibilityLabel={label} onPress={() => place(key)} style={[styles.spot, wide && styles.spotWide, { backgroundColor: color }]}>
      <Text style={styles.spotLabel}>{label}</Text>
      {bets[key] ? <Text style={styles.spotChip}>{money(bets[key])}</Text> : null}
    </Pressable>
  );

  return (
    <GameScreen
      error={error}
      rules="Ruleta europea (0–36). Pleno paga 35 a 1; docenas y columnas 2 a 1; rojo/negro, par/impar y mitades 1 a 1. Columna 1 = 1, 4, 7…; columna 2 = 2, 5, 8…; columna 3 = 3, 6, 9… Retorno al jugador: 97.3 %."
      controls={
        <>
          <Chips fill label="Valor de la ficha" value={chip} onChange={setChip} options={CHIPS} />
          <View style={styles.felt}>{NUMBERS.map((value) => spot(`straight:${value}`, String(value), FELT[rouletteColor(value)]))}</View>
          <View style={styles.felt}>
            {OUTSIDE.map((item) =>
              spot(item.key, item.label, item.key === 'red' ? Colors.red : item.key === 'black' ? Colors.black : Colors.surfaceRaised, true),
            )}
          </View>
          <Line strong label="Total apostado" value={usdt(total)} />
          {problem ? <Text style={styles.problem}>{problem}</Text> : null}
          <Button label="Girar" onPress={spin} loading={busy || spinning} disabled={Boolean(problem)} />
          <Button variant="secondary" label="Quitar fichas" onPress={() => setBets({})} disabled={spinning || total === 0} />
        </>
      }>
      <View style={[styles.wheel, { backgroundColor: shown === null ? Colors.surfaceRaised : FELT[rouletteColor(shown)] }]}>
        <Text style={styles.wheelNumber}>{shown ?? '?'}</Text>
      </View>
      <Outcome payout={last?.payout} bet={last?.bet} idle={spinning ? 'Girando…' : 'Hagan sus apuestas.'} />
    </GameScreen>
  );
}

// ───────────── Minas ─────────────

const MINE_OPTIONS = ['1', '3', '5', '10', '15', '24'].map((value) => ({ value, label: value }));
type MinesRound = { state: MinesState; bet: number; payout: number };

export function Minas() {
  const bet = useBet();
  const { busy, error, send } = usePlay<MinesState>('minas');
  const [mines, setMines] = useState('3');
  const [round, setRound] = useState<MinesRound | null>(null);

  // A round left open (app closed, another device) is picked up where it was.
  useEffect(() => {
    let cancelled = false;
    api<{ round: { bet: number; state: MinesState } | null }>('/api/games/minas')
      .then((data) => {
        if (!cancelled && data.round) setRound({ state: data.round.state, bet: data.round.bet, payout: 0 });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function move(body: object) {
    const response = await send(body);
    if (response) setRound({ state: response.state, bet: response.bet ?? round?.bet ?? 0, payout: response.payout });
  }

  const state = round?.state;
  const playing = Boolean(state && !state.over);
  const over = Boolean(state?.over);

  return (
    <GameScreen
      error={error}
      rules="Hay minas escondidas en 25 casillas. Cada casilla segura que destapas sube el multiplicador; puedes cobrar cuando quieras, pero si destapas una mina pierdes la apuesta. Retorno al jugador: 99 %."
      controls={
        playing && state && round ? (
          <>
            <Line label="Multiplicador" value={`${state.multiplier.toFixed(2)}×`} />
            <Line label="Siguiente casilla" value={`${state.next?.toFixed(2)}×`} />
            <Button
              variant="gold"
              label={state.revealed.length ? `Cobrar ${usdt(round2(round.bet * state.multiplier))}` : 'Destapa una casilla'}
              onPress={() => move({ action: 'cashout' })}
              loading={busy}
              disabled={state.revealed.length === 0}
            />
          </>
        ) : (
          <>
            <BetInput bet={bet} disabled={busy} />
            <Chips fill label="Minas" value={mines} onChange={setMines} options={MINE_OPTIONS} />
            <Button label="Empezar" onPress={() => move({ action: 'start', bet: bet.amount, mines: Number(mines) })} loading={busy} disabled={!bet.amount} />
          </>
        )
      }>
      <View style={styles.board}>
        {Array.from({ length: MINES_TILES }, (_, tile) => {
          const safe = state?.revealed.includes(tile);
          const mine = state?.minePositions?.includes(tile);
          return (
            <Pressable
              key={tile}
              accessibilityRole="button"
              accessibilityLabel={`Casilla ${tile + 1}`}
              disabled={!playing || busy || safe}
              onPress={() => move({ action: 'reveal', tile })}
              style={[
                styles.tile,
                safe && { backgroundColor: Colors.accentSoft },
                mine && { backgroundColor: state?.hit === tile ? Colors.danger : Colors.dangerSoft },
                !playing && !safe && !mine && { opacity: 0.6 },
              ]}>
              <Text style={{ fontSize: 24 }}>{safe ? '💎' : mine ? '💣' : ''}</Text>
            </Pressable>
          );
        })}
      </View>
      <Outcome
        payout={over ? round?.payout : undefined}
        bet={over ? round?.bet : undefined}
        idle={playing ? 'Destapa casillas o cobra.' : 'Elige cuántas minas y empieza.'}
      />
    </GameScreen>
  );
}

// ───────────── Blackjack ─────────────

const OUTCOME_TEXT: Record<BlackjackOutcome, string> = {
  blackjack: '¡Blackjack!',
  win: '¡Ganaste!',
  push: 'Empate',
  lose: 'Gana la casa',
};
type BlackjackRound = { state: BlackjackState; bet: number; payout: number };

function PlayingCard({ card }: { card?: Card }) {
  if (!card) return <View style={[styles.card, { backgroundColor: Colors.accentDeep }]} />;
  const color = card.suit === '♥' || card.suit === '♦' ? Colors.red : Colors.background;
  return (
    <View style={styles.card}>
      <Text style={[styles.cardRank, { color }]}>{card.rank}</Text>
      <Text style={[styles.cardSuit, { color }]}>{card.suit}</Text>
    </View>
  );
}

function Hand({ title, cards, total, hidden }: { title: string; cards: Card[]; total: number; hidden?: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: Spacing.two }}>
      <Muted>
        {title}: {cards.length ? total : '–'}
      </Muted>
      <Row style={{ minHeight: 84 }}>
        {cards.map((card, index) => (
          <PlayingCard key={index} card={card} />
        ))}
        {hidden && <PlayingCard />}
      </Row>
    </View>
  );
}

export function Blackjack() {
  const bet = useBet();
  const { balance } = useAccount();
  const { busy, error, send } = usePlay<BlackjackState>('blackjack');
  const [round, setRound] = useState<BlackjackRound | null>(null);

  // A hand left open (app closed, another device) is picked up where it was.
  useEffect(() => {
    let cancelled = false;
    api<{ round: { bet: number; state: BlackjackState } | null }>('/api/games/blackjack')
      .then((data) => {
        if (!cancelled && data.round) setRound({ state: data.round.state, bet: data.round.bet, payout: 0 });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function move(body: object) {
    const response = await send(body);
    if (response) setRound({ state: response.state, bet: response.bet ?? round?.bet ?? 0, payout: response.payout });
  }

  const state = round?.state;
  const playing = Boolean(state && !state.outcome);

  return (
    <GameScreen
      error={error}
      rules="Gana quien se acerque más a 21 sin pasarse. El blackjack paga 3 a 2. El crupier pide hasta 17 y se planta. Puedes doblar con tus dos primeras cartas: duplicas la apuesta y recibes una sola carta más. No hay división de pares ni seguro."
      controls={
        playing && round ? (
          <>
            <Line label="Apuesta" value={usdt(round.bet)} />
            <Row>
              <Button label="Pedir" onPress={() => move({ action: 'hit' })} disabled={busy} style={{ flex: 1 }} />
              <Button variant="gold" label="Plantarse" onPress={() => move({ action: 'stand' })} disabled={busy} style={{ flex: 1 }} />
            </Row>
            <Button
              variant="secondary"
              label={`Doblar (+${money(round.bet)})`}
              onPress={() => move({ action: 'double' })}
              disabled={busy || !state?.canDouble || balance < round.bet}
            />
          </>
        ) : (
          <>
            <BetInput bet={bet} disabled={busy} />
            <Button label="Repartir" onPress={() => move({ action: 'deal', bet: bet.amount })} loading={busy} disabled={!bet.amount} />
          </>
        )
      }>
      <Hand title="Crupier" cards={state?.dealer ?? []} total={state?.dealerTotal ?? 0} hidden={playing} />
      {state?.outcome ? (
        <Text style={{ fontSize: 22, fontWeight: '900', color: state.outcome === 'lose' ? Colors.danger : state.outcome === 'push' ? Colors.text : Colors.accent }}>
          {OUTCOME_TEXT[state.outcome]}
        </Text>
      ) : null}
      <Outcome
        payout={state?.outcome ? round?.payout : undefined}
        bet={state?.outcome ? round?.bet : undefined}
        idle={playing ? '¿Pides o te plantas?' : 'Haz tu apuesta y reparte.'}
      />
      <Hand title="Tú" cards={state?.player ?? []} total={state?.playerTotal ?? 0} />
    </GameScreen>
  );
}

const styles = StyleSheet.create({
  problem: { color: Colors.gold, fontSize: 12 },
  felt: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  spot: {
    width: '13%',
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.small,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  spotWide: { width: '32%' },
  spotLabel: { color: Colors.text, fontSize: 13, fontWeight: '700' },
  spotChip: {
    position: 'absolute',
    top: -4,
    right: -2,
    paddingHorizontal: 4,
    borderRadius: Radius.pill,
    backgroundColor: Colors.gold,
    color: Colors.background,
    fontSize: 10,
    fontWeight: '700',
    overflow: 'hidden',
  },
  wheel: {
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
    borderWidth: 4,
    borderColor: Colors.gold,
  },
  wheelNumber: { color: Colors.text, fontSize: 48, fontWeight: '900', fontVariant: ['tabular-nums'] },
  board: { width: 290, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { width: 51, height: 51, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.small, backgroundColor: Colors.surfaceRaised },
  card: { width: 56, height: 80, justifyContent: 'space-between', padding: 6, borderRadius: Radius.small, backgroundColor: '#FFFFFF' },
  cardRank: { fontSize: 18, fontWeight: '800' },
  cardSuit: { fontSize: 26, alignSelf: 'center' },
});
