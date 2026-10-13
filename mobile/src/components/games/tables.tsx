import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { Art, BetInput, Chip, GameScreen, Outcome, feel, useBet, usePlay } from '@/components/game-ui';
import { Button, Chips, Line, Muted, Row } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { BOMB_ART, GEM_ART, chipStack } from '@/lib/art';
import { money, usdt } from '@/lib/format';
import {
  MINES_TILES,
  WHEEL_ORDER,
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
const FELT = '#0B4A2F';

// ───────────── Ruleta ─────────────

const CHIP_VALUES = [0.5, 1, 5, 25, 100];
// The felt has three rows; each column of the table goes 3-2-1, 6-5-4, …
const ROWS = [3, 2, 1].map((top) => Array.from({ length: 12 }, (_, column) => column * 3 + top));
const OUTSIDE: { key: string; label: string }[] = [
  { key: 'low', label: '1–18' },
  { key: 'even', label: 'PAR' },
  { key: 'red', label: 'ROJO' },
  { key: 'black', label: 'NEGRO' },
  { key: 'odd', label: 'IMPAR' },
  { key: 'high', label: '19–36' },
];
const POCKET = { red: '#C8102E', black: '#141414', green: '#0F8A4B' };
const STEP = 360 / WHEEL_ORDER.length;
const SPIN_MS = 5200;
const WHEEL_SIZE = 230;
/** Distance of the ball from the centre, as a share of the wheel radius: on the rim, and dropped into a pocket. */
const TRACK = 0.905;
const POCKET_RING = 0.51;
const BALL = 9;
const CELL = 40;

/** Point at `radius` from the centre, `degrees` clockwise from the top. */
function polar(radius: number, degrees: number) {
  const angle = (degrees * Math.PI) / 180;
  return `${(radius * Math.sin(angle)).toFixed(2)} ${(-radius * Math.cos(angle)).toFixed(2)}`;
}

/** Slice of a ring between two radii, centred on `degrees`. */
function wedge(inner: number, outer: number, degrees: number) {
  const from = degrees - STEP / 2;
  const to = degrees + STEP / 2;
  return `M${polar(outer, from)} A${outer} ${outer} 0 0 1 ${polar(outer, to)} L${polar(inner, to)} A${inner} ${inner} 0 0 0 ${polar(inner, from)}Z`;
}

/** The wheel itself never changes, so it is drawn once and only its container turns. */
const WHEEL = (
  <Svg viewBox="-100 -100 200 200" width={WHEEL_SIZE} height={WHEEL_SIZE}>
    <Circle r="99" fill="#3A220E" />
    <Circle r="94" fill="#0E0E0E" />
    {WHEEL_ORDER.map((value, index) => (
      <G key={value}>
        <Path d={wedge(44, 87, index * STEP)} fill={POCKET[rouletteColor(value)]} stroke="#D9A32A" strokeWidth="0.5" />
        <G rotation={index * STEP} origin="0, 0">
          <SvgText y={-72} fill="#FFFFFF" fontSize="9" fontWeight="700" textAnchor="middle">
            {String(value)}
          </SvgText>
        </G>
      </G>
    ))}
    <Circle r="60" fill="none" stroke="#D9A32A" strokeWidth="0.6" />
    <Circle r="44" fill="#D9A32A" />
    <Circle r="38" fill="#F3CF6B" />
    <Rect x="-3" y="-34" width="6" height="68" rx="3" fill="#8A5A0C" />
    <Rect x="-34" y="-3" width="68" height="6" rx="3" fill="#8A5A0C" />
    <Circle r="9" fill="#FFF3B0" stroke="#7A5410" strokeWidth="1.5" />
  </Svg>
);

/** "straight:17" → { type: "straight", value: 17 } */
function toBet(key: string, amount: number): RouletteBet {
  const [type, value] = key.split(':');
  return { type: type as RouletteBetType, ...(value === undefined ? {} : { value: Number(value) }), amount };
}

/** Degrees the wheel turns on a spin: two full turns plus a random part of a third. */
const randomTurn = () => 720 + Math.random() * 360;

const degrees = (value: Animated.Value) => value.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });

export function Ruleta() {
  const { balance, setBalance, settings } = useAccount();
  const { busy, error, send } = usePlay<RouletteState>('ruleta');
  const [chip, setChip] = useState(1);
  /** Amount placed on each spot of the felt. */
  const [bets, setBets] = useState<Record<string, number>>({});
  const [spinning, setSpinning] = useState(false);
  const [last, setLast] = useState<{ payout: number; bet: number; number: number } | null>(null);
  // Angles of the wheel and of the ball, in degrees, and how far the ball is from the centre.
  const [wheel] = useState(() => new Animated.Value(0));
  const [ball] = useState(() => new Animated.Value(0));
  const [orbit] = useState(() => new Animated.Value(TRACK));
  const angles = useRef({ wheel: 0, ball: 0 });

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
    if (spinning) return;
    feel.tap();
    setBets((old) => ({ ...old, [key]: round2((old[key] ?? 0) + chip) }));
  };

  async function spin() {
    if (problem || spinning) return;
    setSpinning(true);
    setLast(null);
    const response = await send({ bets: Object.entries(bets).map(([key, amount]) => toBet(key, amount)) }, true);
    if (!response) return setSpinning(false);

    // The wheel turns clockwise and the ball against it; both stop with the ball over the winning pocket.
    const nextWheel = angles.current.wheel + randomTurn();
    const target = nextWheel + WHEEL_ORDER.indexOf(response.state.number) * STEP;
    const nextBall = target - 360 * Math.ceil((target - angles.current.ball + 1440) / 360);
    angles.current = { wheel: nextWheel, ball: nextBall };
    const easing = Easing.bezier(0.18, 0.7, 0.2, 1);
    orbit.setValue(TRACK);
    Animated.parallel([
      Animated.timing(wheel, { toValue: nextWheel, duration: SPIN_MS, easing, useNativeDriver: true }),
      Animated.timing(ball, { toValue: nextBall, duration: SPIN_MS, easing, useNativeDriver: true }),
      // The ball leaves the rim during the last part of the spin.
      Animated.timing(orbit, { toValue: POCKET_RING, duration: 1100, delay: SPIN_MS - 1700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => {
      setSpinning(false);
      setLast({ payout: response.payout, bet: total, number: response.state.number });
      setBalance(response.balance);
      feel.outcome(response.payout, total);
    });
  }

  /** A spot of the felt with the chips on it. */
  const spot = (key: string, label: string, width: number, color?: string, height = CELL) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => place(key)}
      style={[styles.spot, { width, height }, color ? { backgroundColor: color } : null, last && key === `straight:${last.number}` ? styles.spotHit : null]}>
      {bets[key] ? <Chip amount={bets[key]} size={26} /> : <Text style={[styles.spotLabel, width > CELL && { fontSize: 11 }]}>{label}</Text>}
    </Pressable>
  );

  return (
    <GameScreen
      error={error}
      stageColor={FELT}
      rules="Ruleta europea (0–36). Pleno paga 35 a 1; docenas y columnas 2 a 1; rojo/negro, par/impar y mitades 1 a 1. Retorno al jugador: 97.3 %."
      controls={
        <>
          <Muted style={{ fontSize: 13 }}>Valor de la ficha</Muted>
          <Row style={{ justifyContent: 'space-between' }}>
            {CHIP_VALUES.map((value) => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected: chip === value }}
                accessibilityLabel={`Ficha de ${value}`}
                onPress={() => setChip(value)}
                style={[styles.chipPick, chip === value && styles.chipPicked]}>
                <Chip amount={value} size={42} />
              </Pressable>
            ))}
          </Row>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.table}>
              {spot('straight:0', '0', CELL, POCKET.green, CELL * 3)}
              <View>
                {ROWS.map((row, index) => (
                  <View key={index} style={{ flexDirection: 'row' }}>
                    {row.map((value) => spot(`straight:${value}`, String(value), CELL, POCKET[rouletteColor(value)]))}
                    {spot(`column:${3 - index}`, '2 a 1', 52)}
                  </View>
                ))}
                <View style={{ flexDirection: 'row' }}>{[1, 2, 3].map((dozen) => spot(`dozen:${dozen}`, `${dozen}ª DOCENA`, CELL * 4))}</View>
                <View style={{ flexDirection: 'row' }}>
                  {OUTSIDE.map((item) => spot(item.key, item.label, CELL * 2, item.key === 'red' ? POCKET.red : item.key === 'black' ? POCKET.black : undefined))}
                </View>
              </View>
            </View>
          </ScrollView>
          <Line strong label="Total apostado" value={usdt(total)} />
          {problem ? <Text style={styles.problem}>{problem}</Text> : null}
          <Button label="Girar" onPress={spin} loading={busy || spinning} disabled={Boolean(problem)} />
          <Button variant="secondary" label="Quitar fichas" onPress={() => setBets({})} disabled={spinning || total === 0} />
        </>
      }>
      <View style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}>
        <Animated.View style={{ transform: [{ rotate: degrees(wheel) }] }}>{WHEEL}</Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', transform: [{ rotate: degrees(ball) }] }]}>
          <Animated.View style={[styles.ball, { transform: [{ translateY: Animated.multiply(orbit, -WHEEL_SIZE / 2) }] }]} />
        </Animated.View>
      </View>
      <Row style={{ gap: Spacing.three }}>
        <View style={[styles.result, { backgroundColor: last ? POCKET[rouletteColor(last.number)] : 'rgba(0, 0, 0, 0.35)' }]}>
          <Text style={styles.resultNumber}>{last ? last.number : '–'}</Text>
        </View>
        <Outcome payout={last?.payout} bet={last?.bet} idle={spinning ? 'No va más…' : 'Hagan sus apuestas'} />
      </Row>
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
    if (!response) return;
    const stake = response.bet ?? round?.bet ?? 0;
    setRound({ state: response.state, bet: stake, payout: response.payout });
    if (response.state.hit !== null) feel.thud();
    else if (response.state.over) feel.outcome(response.payout, stake);
    else feel.tap();
  }

  const state = round?.state;
  const playing = Boolean(state && !state.over);
  const over = Boolean(state?.over);
  const mineCount = state?.mines ?? Number(mines);

  return (
    <GameScreen
      error={error}
      stageColor="#0C1820"
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
      <Row style={{ gap: Spacing.four }}>
        <Row>
          <Art source={GEM_ART} size={18} />
          <Text style={styles.count}>{MINES_TILES - mineCount - (state?.revealed.length ?? 0)} gemas</Text>
        </Row>
        <Row>
          <Art source={BOMB_ART} size={18} />
          <Text style={styles.count}>{mineCount} minas</Text>
        </Row>
      </Row>
      <View style={styles.board}>
        {Array.from({ length: MINES_TILES }, (_, tile) => {
          const safe = Boolean(state?.revealed.includes(tile));
          const mine = Boolean(state?.minePositions?.includes(tile));
          const hit = state?.hit === tile;
          return (
            <Pressable
              key={tile}
              accessibilityRole="button"
              accessibilityLabel={`Casilla ${tile + 1}`}
              disabled={!playing || busy || safe}
              onPress={() => move({ action: 'reveal', tile })}
              style={({ pressed }) => [
                styles.tile,
                safe && styles.tileSafe,
                mine && (hit ? styles.tileHit : styles.tileMine),
                pressed && { borderBottomWidth: 1, marginTop: 4 },
              ]}>
              {safe || mine ? <Art source={safe ? GEM_ART : BOMB_ART} size={34} /> : null}
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
  blackjack: '¡BLACKJACK!',
  win: '¡GANASTE!',
  push: 'EMPATE',
  lose: 'GANA LA CASA',
};
type BlackjackRound = { state: BlackjackState; bet: number; payout: number };

/** A card that slides in from the shoe (top right of the table) when it is dealt. */
function PlayingCard({ card, index }: { card?: Card; index: number }) {
  const [entry] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(entry, { toValue: 1, duration: 320, delay: Math.min(index, 3) * 90, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [entry, index]);

  const color = card && (card.suit === '♥' || card.suit === '♦') ? Colors.red : '#111111';
  return (
    <Animated.View
      style={[
        styles.card,
        !card && styles.cardBack,
        {
          marginLeft: index === 0 ? 0 : -18,
          opacity: entry,
          transform: [
            { translateX: entry.interpolate({ inputRange: [0, 1], outputRange: [120, 0] }) },
            { translateY: entry.interpolate({ inputRange: [0, 1], outputRange: [-110, 0] }) },
            { rotate: entry.interpolate({ inputRange: [0, 1], outputRange: ['25deg', '0deg'] }) },
          ],
        },
      ]}>
      {card ? (
        <>
          <Text style={[styles.cardRank, { color }]}>{card.rank}</Text>
          <Text style={[styles.cardCorner, { color }]}>{card.suit}</Text>
          <Text style={[styles.cardSuit, { color }]}>{card.suit}</Text>
        </>
      ) : null}
    </Animated.View>
  );
}

function Hand({ title, cards, total, hidden }: { title: string; cards: Card[]; total: number; hidden?: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: Spacing.two }}>
      <View style={styles.hand}>
        {cards.map((card, index) => (
          <PlayingCard key={index} card={card} index={index} />
        ))}
        {hidden && <PlayingCard index={cards.length} />}
        {cards.length === 0 && <View style={styles.cardSlot} />}
      </View>
      <Row>
        <Text style={styles.handTitle}>{title}</Text>
        {cards.length > 0 && <Text style={styles.handTotal}>{total}</Text>}
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
    if (!response) return;
    const stake = response.bet ?? round?.bet ?? 0;
    setRound({ state: response.state, bet: stake, payout: response.payout });
    if (response.state.outcome) feel.outcome(response.payout, stake);
    else feel.tap();
  }

  const state = round?.state;
  const playing = Boolean(state && !state.outcome);

  return (
    <GameScreen
      error={error}
      stageColor={FELT}
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
      <Hand title="CRUPIER" cards={state?.dealer ?? []} total={state?.dealerTotal ?? 0} hidden={playing} />
      <View style={styles.banner}>
        <Text style={styles.printed}>BLACKJACK PAGA 3 A 2</Text>
        {state?.outcome ? (
          <Text style={[styles.outcome, { color: state.outcome === 'lose' ? Colors.danger : state.outcome === 'push' ? Colors.text : Colors.gold }]}>
            {OUTCOME_TEXT[state.outcome]}
          </Text>
        ) : null}
        <Outcome
          payout={state?.outcome ? round?.payout : undefined}
          bet={state?.outcome ? round?.bet : undefined}
          idle={playing ? '¿Pides o te plantas?' : 'Haz tu apuesta y reparte'}
        />
      </View>
      <Hand title="TÚ" cards={state?.player ?? []} total={state?.playerTotal ?? 0} />
      {/* The bet, as chips on the betting circle. */}
      <View style={styles.circle}>
        {round
          ? chipStack(round.bet, 3).map((chip, index) => (
              <View key={index} style={{ position: 'absolute', bottom: 8 + index * 4 }}>
                <Chip amount={index === 0 ? round.bet : chip.value} size={30} />
              </View>
            ))
          : null}
      </View>
    </GameScreen>
  );
}

const styles = StyleSheet.create({
  problem: { color: Colors.gold, fontSize: 12 },
  // Ruleta
  ball: { width: BALL, height: BALL, borderRadius: BALL / 2, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#BBBBBB' },
  result: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.medium, borderWidth: 2, borderColor: Colors.gold },
  resultNumber: { color: Colors.text, fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'] },
  chipPick: { padding: 3, borderRadius: Radius.pill, borderWidth: 2, borderColor: 'transparent', opacity: 0.7 },
  chipPicked: { borderColor: Colors.accent, opacity: 1 },
  table: { flexDirection: 'row', padding: 3, borderRadius: Radius.small, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.6)', backgroundColor: '#0B5D3B' },
  spot: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255, 255, 255, 0.6)' },
  spotHit: { borderWidth: 3, borderColor: Colors.gold },
  spotLabel: { color: Colors.text, fontSize: 14, fontWeight: '700' },
  // Minas
  count: { color: Colors.text, fontSize: 13 },
  board: { width: 5 * 54 + 4 * Spacing.two, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.small,
    backgroundColor: '#34495A',
    borderBottomWidth: 5,
    borderBottomColor: '#17232B',
  },
  tileSafe: { backgroundColor: '#0D3324', borderBottomWidth: 0, borderWidth: 2, borderColor: 'rgba(31, 223, 122, 0.5)' },
  tileMine: { backgroundColor: '#2A1215', borderBottomWidth: 0, opacity: 0.75 },
  tileHit: { backgroundColor: Colors.red, borderBottomWidth: 0 },
  // Blackjack
  hand: { minHeight: 92, flexDirection: 'row', paddingLeft: Spacing.two },
  handTitle: { color: 'rgba(255, 255, 255, 0.7)', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  handTotal: {
    color: Colors.text,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    fontSize: 14,
    fontWeight: '800',
    overflow: 'hidden',
  },
  card: {
    width: 64,
    height: 92,
    padding: 5,
    borderRadius: Radius.small,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CFCFCF',
    elevation: 4,
  },
  cardBack: { backgroundColor: '#8E1B2A', borderWidth: 4, borderColor: '#FFFFFF' },
  cardSlot: { width: 64, height: 92, borderRadius: Radius.small, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255, 255, 255, 0.25)' },
  cardRank: { fontSize: 18, lineHeight: 20, fontWeight: '900' },
  cardCorner: { fontSize: 14, lineHeight: 15 },
  cardSuit: { position: 'absolute', right: 6, bottom: 4, fontSize: 34 },
  banner: { alignItems: 'center', gap: Spacing.one },
  printed: { color: Colors.gold, fontSize: 12, fontWeight: '700', letterSpacing: 3, opacity: 0.85 },
  outcome: { fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  circle: { width: 54, height: 54, alignItems: 'center', borderRadius: Radius.pill, borderWidth: 2, borderColor: 'rgba(245, 184, 61, 0.6)' },
});
