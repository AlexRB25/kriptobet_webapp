import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, Line as SvgLine, LinearGradient, Polygon, Polyline, Stop, Text as SvgText } from 'react-native-svg';

import { Art, BetInput, GameScreen, Outcome, feel, useBet, usePlay } from '@/components/game-ui';
import { Button, Chips, Field, Line, Muted, Row } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { ROCKET_ART, SLOT_ART } from '@/lib/art';
import { parseAmount, usdt } from '@/lib/format';
import {
  SLOT_LINES,
  SLOT_PAYS,
  SLOT_SYMBOL_IDS,
  type CrashState,
  type DiceParams,
  type DiceState,
  type SlotSymbol,
  type SlotWin,
  type SlotsState,
} from '@/lib/games';
import { useAccount } from '@/store/account';

// The three one-tap games: dados, crash and slots.

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Last results of a game as a row of pills, newest first. */
function History({ items }: { items: { label: string; good: boolean }[] }) {
  return (
    <View style={styles.history}>
      {items.map((item, index) => (
        <Text key={index} style={[styles.pill, item.good ? styles.pillGood : styles.pillBad]}>
          {item.label}
        </Text>
      ))}
    </View>
  );
}

// ───────────── Dados ─────────────

// Same formula as diceMultiplier in web/src/lib/games/engine.ts (99 % return).
const diceMultiplier = (chance: number) => Math.floor(990_000 / Math.round(chance * 100)) / 100;
const CHANCES = ['5', '10', '25', '50', '75', '90'].map((value) => ({ value, label: `${value} %` }));

export function Dados() {
  const bet = useBet();
  const { busy, error, send } = usePlay<DiceState>('dados');
  const [chance, setChance] = useState('50');
  const [direction, setDirection] = useState<DiceParams['direction']>('under');
  const [last, setLast] = useState<{ state: DiceState; payout: number; bet: number } | null>(null);
  const [history, setHistory] = useState<DiceState[]>([]);
  // Where the die sits on the track, 0–100.
  const [position] = useState(() => new Animated.Value(50));

  const multiplier = diceMultiplier(Number(chance));
  // Rolls go from 0.00 to 99.99; the winning zone is one end of that range.
  const threshold = direction === 'under' ? Number(chance) : 100 - Number(chance);

  async function roll() {
    if (!bet.amount) return;
    const stake = bet.amount;
    const response = await send({ bet: stake, chance: Number(chance), direction });
    if (!response) return;
    setLast({ state: response.state, payout: response.payout, bet: stake });
    setHistory((old) => [response.state, ...old].slice(0, 6));
    Animated.timing(position, { toValue: response.state.roll, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    feel.outcome(response.payout, stake);
  }

  return (
    <GameScreen
      error={error}
      stageColor="#10142A"
      rules="Sale un número entre 0.00 y 99.99. Ganas si cae en la zona verde. Entre menos probabilidad eliges, más paga. Retorno al jugador: 99 %."
      controls={
        <>
          <BetInput bet={bet} disabled={busy} />
          <Chips
            fill
            value={direction}
            onChange={setDirection}
            options={[
              { value: 'under', label: 'Menor que' },
              { value: 'over', label: 'Mayor que' },
            ]}
          />
          <Chips label="Probabilidad de ganar" value={chance} onChange={setChance} options={CHANCES} />
          <Line label="Multiplicador" value={`${multiplier.toFixed(2)}×`} />
          <Line strong label="Premio" value={usdt(round2((bet.amount ?? 0) * multiplier))} tone="good" />
          <Button label="Tirar" onPress={roll} loading={busy} disabled={!bet.amount} />
        </>
      }>
      <History items={history.map((item) => ({ label: item.roll.toFixed(2), good: item.win }))} />
      <Text style={[styles.big, { color: last ? (last.state.win ? Colors.accent : Colors.danger) : Colors.textSecondary }]}>
        {last ? last.state.roll.toFixed(2) : '00.00'}
      </Text>
      <View style={styles.track}>
        <View style={[styles.trackZone, direction === 'under' ? { left: 0, width: `${threshold}%` } : { left: `${threshold}%`, right: 0 }]} />
        {last && (
          // The die slides along the track to the number rolled.
          <Animated.View
            style={[
              styles.die,
              { borderColor: last.state.win ? Colors.accent : Colors.danger },
              { left: position.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) },
            ]}>
            <Text style={styles.dieText}>{last.state.roll.toFixed(1)}</Text>
          </Animated.View>
        )}
      </View>
      <Text style={[styles.caption, { marginTop: Spacing.three }]}>
        {direction === 'under' ? 'Menor que' : 'Mayor o igual a'} {threshold.toFixed(2)}
      </Text>
      <Outcome payout={last?.payout} bet={last?.bet} idle="Elige tu probabilidad y tira." />
    </GameScreen>
  );
}

// ───────────── Crash ─────────────

/** Seconds the climb lasts at most, however high the round goes. */
const MAX_SECONDS = 6;
const GROWTH = 0.35;
// Chart area, in SVG units.
const WIDTH = 400;
const HEIGHT = 260;
const PAD = { left: 38, bottom: 22, top: 14, right: 30 };

/** Curve of the round so far and where its tip is. The scale grows with the multiplier, as on a real crash chart. */
function chart(shown: number) {
  const top = Math.max(2, shown * 1.15);
  const x = (share: number) => PAD.left + share * (WIDTH - PAD.left - PAD.right);
  const y = (value: number) => HEIGHT - PAD.bottom - ((value - 1) / (top - 1)) * (HEIGHT - PAD.bottom - PAD.top);
  const steps = 30;
  // Same exponential shape as the climb: value(share) = shown^share.
  const points = Array.from({ length: steps + 1 }, (_, index) => `${x((index / steps) * 0.92).toFixed(1)},${y(Math.pow(shown, index / steps)).toFixed(1)}`);
  const ticks = [1, 1 + (top - 1) / 3, 1 + ((top - 1) * 2) / 3, top].map((value) => ({ value, y: y(value) }));
  return { line: points.join(' '), tip: { x: x(0.92), y: y(shown) }, base: y(1), start: x(0), ticks, y, top };
}

export function Crash() {
  const bet = useBet();
  const { setBalance } = useAccount();
  const { busy, error, send } = usePlay<CrashState>('crash');
  const [targetText, setTargetText] = useState('2.00');
  const [shown, setShown] = useState(1);
  const [round, setRound] = useState<{ state: CrashState; payout: number; bet: number; flying: boolean } | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const frame = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const target = parseAmount(targetText);
  const validTarget = target !== null && target >= 1.01 && target <= 1000;

  async function play() {
    if (!bet.amount || !validTarget) return;
    const stake = bet.amount;
    const response = await send({ bet: stake, target }, true);
    if (!response) return;

    // The outcome is already decided; the climb only reveals it.
    const { point, win } = response.state;
    const seconds = Math.min(MAX_SECONDS, Math.log(point) / GROWTH);
    const rate = seconds > 0 ? Math.log(point) / seconds : 0;
    const startedAt = Date.now();
    let cashed = false;
    setRound({ state: response.state, payout: response.payout, bet: stake, flying: true });
    setShown(1);

    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const value = Math.exp(rate * elapsed);
      if (win && !cashed && value >= response.state.target) {
        cashed = true;
        feel.outcome(response.payout, stake);
      }
      if (elapsed >= seconds) {
        setShown(point);
        setRound((old) => old && { ...old, flying: false });
        setHistory((old) => [point, ...old].slice(0, 6));
        setBalance(response.balance);
        if (!win) feel.thud();
        return;
      }
      setShown(value);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }

  const flying = Boolean(round?.flying);
  const crashed = Boolean(round && !flying);
  const cashed = round && round.state.win && shown >= round.state.target;
  const { line, tip, base, start, ticks, y, top } = chart(shown);
  const color = crashed ? Colors.danger : Colors.accent;

  return (
    <GameScreen
      error={error}
      stageColor="#070B14"
      rules="El multiplicador sube hasta que explota. Eliges de antemano en cuánto cobrar: si llega a tu objetivo ganas tu apuesta por ese multiplicador; si explota antes, la pierdes. Retorno al jugador: 99 %."
      controls={
        <>
          <BetInput bet={bet} disabled={busy || flying} />
          <Field label="Cobrar en (multiplicador)" numeric value={targetText} onChangeText={setTargetText} editable={!flying} />
          <Row>
            {['1.50', '2.00', '5.00', '10.00'].map((value) => (
              <Button key={value} variant="secondary" label={`${Number(value)}×`} onPress={() => setTargetText(value)} disabled={flying} style={styles.quick} />
            ))}
          </Row>
          <Line label="Probabilidad" value={validTarget ? `${(99 / target).toFixed(2)} %` : '—'} />
          <Line strong label="Premio" value={usdt(validTarget ? round2((bet.amount ?? 0) * target) : 0)} tone="good" />
          {!validTarget && <Text style={styles.problem}>El objetivo va de 1.01× a 1000×.</Text>}
          <Button label="Despegar" onPress={play} loading={busy || flying} disabled={!bet.amount || !validTarget} />
        </>
      }>
      <History items={history.map((point) => ({ label: `${point.toFixed(2)}×`, good: point >= 2 }))} />
      <View style={{ width: '100%', aspectRatio: WIDTH / HEIGHT }}>
        <Svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height="100%">
          <Defs>
            <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity="0.45" />
              <Stop offset="1" stopColor={color} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {ticks.map((tick, index) => (
            <SvgLine key={`grid-${index}`} x1={PAD.left} x2={WIDTH - 6} y1={tick.y} y2={tick.y} stroke="rgba(255,255,255,0.08)" />
          ))}
          {ticks.map((tick, index) => (
            <SvgText key={`label-${index}`} x={PAD.left - 5} y={tick.y + 4} fill={Colors.textSecondary} fontSize="11" textAnchor="end">
              {`${tick.value.toFixed(tick.value < 10 ? 1 : 0)}×`}
            </SvgText>
          ))}
          {round && round.state.target <= top ? (
            // The cash-out level the player chose.
            <SvgLine x1={PAD.left} x2={WIDTH - 6} y1={y(round.state.target)} y2={y(round.state.target)} stroke={Colors.gold} strokeDasharray="5 4" />
          ) : null}
          <Polygon points={`${start},${base} ${line} ${tip.x},${base}`} fill="url(#fill)" />
          <Polyline points={line} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <View style={[styles.rocket, { left: `${(tip.x / WIDTH) * 100}%`, top: `${(tip.y / HEIGHT) * 100}%` }]}>
          {crashed ? <Text style={{ fontSize: 28 }}>💥</Text> : <Art source={ROCKET_ART} size={36} />}
        </View>
        <View style={styles.overlay} pointerEvents="none">
          <Text style={[styles.big, { color: crashed ? Colors.danger : flying ? Colors.text : Colors.textSecondary }]}>{shown.toFixed(2)}×</Text>
          <Text style={[styles.caption, { color: crashed && !cashed ? Colors.danger : Colors.accent }]}>
            {cashed ? `✓ Cobraste en ${round.state.target.toFixed(2)}×` : crashed ? 'EXPLOTÓ' : ' '}
          </Text>
        </View>
      </View>
      <Outcome payout={round?.payout} bet={round?.bet} pending={flying} idle="Elige en cuánto cobrar y despega." />
    </GameScreen>
  );
}

// ───────────── Slots ─────────────

const IDLE: SlotSymbol[][] = [
  ['lemon', 'seven', 'cherry'],
  ['bell', 'seven', 'star'],
  ['diamond', 'seven', 'orange'],
  ['cherry', 'seven', 'bell'],
  ['star', 'seven', 'lemon'],
];
const LINE_COLORS = ['#F5B83D', '#29B6F6', '#FF5FA2', '#1FDF7A', '#B388FF'];
/** Milliseconds the first reel turns, and how much longer each next one does. */
const FIRST_STOP = 1100;
const STOP_GAP = 280;

const randomSymbol = () => SLOT_SYMBOL_IDS[Math.floor(Math.random() * SLOT_SYMBOL_IDS.length)];

type ReelProps = {
  /** The three symbols the reel rests on, followed by the ones that scroll past while it turns. */
  strip: SlotSymbol[];
  cell: number;
  /** Changes on every spin; 0 before the first one. */
  spinId: number;
  duration: number;
  /** Rows of this reel that are part of a winning line. */
  winning: number[];
  dim: boolean;
};

function Reel({ strip, cell, spinId, duration, winning, dim }: ReelProps) {
  const [offset] = useState(() => new Animated.Value(0));

  // A new strip falls from its far end down to its first three symbols. Positioned before the
  // first paint of the new strip, so the result is never visible ahead of the fall.
  useLayoutEffect(() => {
    if (!spinId) return;
    offset.setValue(-(strip.length - 3) * cell);
    Animated.timing(offset, { toValue: 0, duration, easing: Easing.out(Easing.back(1.1)), useNativeDriver: true }).start();
    // Only a new spin restarts the fall.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinId]);

  return (
    <View style={[styles.reel, { width: cell, height: cell * 3 }]}>
      <Animated.View style={{ transform: [{ translateY: offset }] }}>
        {strip.map((symbol, row) => {
          const won = row < 3 && winning.includes(row);
          return (
            <View key={row} style={[{ width: cell, height: cell }, styles.cell, won && styles.cellWon, dim && !won && row < 3 && { opacity: 0.35 }]}>
              <Art source={SLOT_ART[symbol]} size={cell * 0.76} />
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
}

export function Slots() {
  const bet = useBet();
  const { width } = useWindowDimensions();
  const { setBalance } = useAccount();
  const { busy, error, send } = usePlay<SlotsState>('slots');
  const [strips, setStrips] = useState(IDLE);
  const [spinId, setSpinId] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [last, setLast] = useState<{ payout: number; bet: number; wins: SlotWin[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  // Five reels and their gaps have to fit between the screen, stage and cabinet paddings.
  const cell = Math.min(66, Math.floor((width - 2 * Spacing.three - 2 * Spacing.three - 2 * Spacing.two - 4 * Spacing.one) / 5));

  async function play() {
    if (!bet.amount || spinning) return;
    const stake = bet.amount;
    setSpinning(true);
    setLast(null);
    const response = await send({ bet: stake }, true);
    if (!response) return setSpinning(false);

    // The result is already decided: the reels only reveal it, one after another.
    const { reels, wins } = response.state;
    setStrips((old) => reels.map((reel, index) => [...reel, ...Array.from({ length: 12 + index * 4 }, randomSymbol), ...old[index].slice(0, 3)]));
    setSpinId((id) => id + 1);
    feel.tap();
    timer.current = setTimeout(
      () => {
        setSpinning(false);
        setLast({ payout: response.payout, bet: stake, wins });
        setBalance(response.balance);
        feel.outcome(response.payout, stake);
      },
      FIRST_STOP + (reels.length - 1) * STOP_GAP,
    );
  }

  const wins = last?.wins ?? [];

  return (
    <GameScreen
      error={error}
      stageColor="#1C0B26"
      rules="Cinco rodillos y cinco líneas de pago fijas: las tres filas y las dos diagonales en V. Tu apuesta se reparte entre las cinco líneas; cada una paga por dos o más símbolos iguales seguidos empezando por el rodillo izquierdo. Retorno al jugador: 96.4 %."
      controls={
        <>
          <BetInput bet={bet} disabled={spinning} />
          <Button label="Girar" onPress={play} loading={busy || spinning} disabled={!bet.amount} />
          <Muted style={{ fontSize: 12 }}>Pagos por línea (× apuesta de línea)</Muted>
          <View>
            <Row style={styles.payRow}>
              <View style={{ width: 26 }} />
              {[5, 4, 3, 2].map((count) => (
                <Text key={count} style={[styles.payCell, { color: Colors.textSecondary }]}>
                  ×{count}
                </Text>
              ))}
            </Row>
            {SLOT_SYMBOL_IDS.map((symbol) => (
              <Row key={symbol} style={styles.payRow}>
                <Art source={SLOT_ART[symbol]} size={26} />
                {[3, 2, 1, 0].map((index) => (
                  <Text key={index} style={[styles.payCell, index === 3 && { color: Colors.gold, fontWeight: '800' }]}>
                    {SLOT_PAYS[symbol][index]}
                  </Text>
                ))}
              </Row>
            ))}
          </View>
        </>
      }>
      <View style={styles.cabinet}>
        <Text style={styles.marquee}>● ● KRIPTO SLOTS ● ●</Text>
        <View style={styles.window}>
          {strips.map((strip, index) => (
            <Reel
              key={index}
              strip={strip}
              cell={cell}
              spinId={spinId}
              duration={FIRST_STOP + index * STOP_GAP}
              winning={spinning ? [] : wins.filter((win) => index < win.count).map((win) => SLOT_LINES[win.line][index])}
              dim={!spinning && wins.length > 0}
            />
          ))}
          {/* Winning paylines, drawn over the reels. */}
          <Svg viewBox="0 0 5 3" preserveAspectRatio="none" style={StyleSheet.absoluteFill} pointerEvents="none">
            {wins.map((win) => (
              <Polyline
                key={win.line}
                points={SLOT_LINES[win.line].map((row, reel) => `${reel + 0.5},${row + 0.5}`).join(' ')}
                fill="none"
                stroke={LINE_COLORS[win.line]}
                strokeWidth={0.07}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.85}
              />
            ))}
          </Svg>
        </View>
      </View>
      {last && wins.length > 0 ? (
        <Text style={[styles.caption, { color: Colors.gold }]}>
          {wins.length === 1 ? '1 línea ganadora' : `${wins.length} líneas ganadoras`}
          {last.payout < last.bet ? ' (premio menor que la apuesta)' : ''}
        </Text>
      ) : null}
      {last && last.payout > 0 ? (
        <Text style={styles.collect}>Cobras {last.payout.toFixed(2)} USDT</Text>
      ) : (
        <Outcome payout={last?.payout} bet={last?.bet} idle={spinning ? 'Girando…' : '¡Suerte!'} />
      )}
    </GameScreen>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: 60, fontWeight: '900', fontVariant: ['tabular-nums'] },
  caption: { color: Colors.textSecondary, fontSize: 13, fontWeight: '700' },
  problem: { color: Colors.gold, fontSize: 12 },
  quick: { flex: 1, minHeight: 36, paddingHorizontal: Spacing.one },
  collect: { color: Colors.accent, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  history: { minHeight: 24, alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.one, overflow: 'hidden' },
  pill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    overflow: 'hidden',
  },
  pillGood: { color: Colors.accent, backgroundColor: Colors.accentSoft },
  pillBad: { color: Colors.danger, backgroundColor: Colors.dangerSoft },
  track: { width: '86%', height: 18, borderRadius: Radius.pill, backgroundColor: 'rgba(248, 113, 113, 0.5)', marginTop: Spacing.three },
  trackZone: { position: 'absolute', top: 0, bottom: 0, borderRadius: Radius.pill, backgroundColor: Colors.accent },
  die: {
    position: 'absolute',
    top: -14,
    width: 46,
    height: 46,
    marginLeft: -23,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.small,
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
  },
  dieText: { color: Colors.background, fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
  rocket: { position: 'absolute', marginLeft: -18, marginTop: -22 },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  cabinet: { padding: Spacing.two, borderRadius: Radius.large, backgroundColor: Colors.gold, borderWidth: 2, borderColor: '#8A5A0C' },
  marquee: { color: '#3B1D00', fontSize: 11, fontWeight: '900', letterSpacing: 3, textAlign: 'center', marginBottom: Spacing.one },
  window: { flexDirection: 'row', gap: Spacing.one, padding: Spacing.one, borderRadius: Radius.medium, backgroundColor: '#12081A' },
  reel: { overflow: 'hidden', borderRadius: Radius.small, backgroundColor: '#F1F1F6' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  cellWon: { backgroundColor: '#FFF3C4' },
  payRow: { justifyContent: 'space-between', paddingVertical: 2 },
  payCell: { flex: 1, color: Colors.text, fontSize: 14, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
