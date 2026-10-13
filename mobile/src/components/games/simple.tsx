import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BetInput, GameScreen, Outcome, useBet, usePlay } from '@/components/game-ui';
import { Button, Chips, Field, Line, Row } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { parseAmount, usdt } from '@/lib/format';
import type { CrashState, DiceParams, DiceState, SlotsState } from '@/lib/games';
import { useAccount } from '@/store/account';

// The three one-tap games: dados, crash and slots.

const round2 = (value: number) => Math.round(value * 100) / 100;

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

  const multiplier = diceMultiplier(Number(chance));
  // Rolls go from 0.00 to 99.99; the winning zone is one end of that range.
  const threshold = direction === 'under' ? Number(chance) : 100 - Number(chance);

  async function roll() {
    if (!bet.amount) return;
    const response = await send({ bet: bet.amount, chance: Number(chance), direction });
    if (response) setLast({ state: response.state, payout: response.payout, bet: bet.amount });
  }

  return (
    <GameScreen
      error={error}
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
      <Text style={[styles.big, { color: last ? (last.state.win ? Colors.accent : Colors.danger) : Colors.textSecondary }]}>
        {last ? last.state.roll.toFixed(2) : '00.00'}
      </Text>
      <View style={styles.bar}>
        <View
          style={[
            styles.barZone,
            direction === 'under' ? { left: 0, width: `${threshold}%` } : { left: `${threshold}%`, right: 0 },
          ]}
        />
        {last && <View style={[styles.barMarker, { left: `${last.state.roll}%` }]} />}
      </View>
      <Text style={styles.caption}>
        {direction === 'under' ? 'Menor que' : 'Mayor o igual a'} {threshold.toFixed(2)}
      </Text>
      <Outcome payout={last?.payout} bet={last?.bet} idle="Elige tu probabilidad y tira." />
    </GameScreen>
  );
}

// ───────────── Crash ─────────────

/** Seconds the climb lasts at most, however high the round goes. */
const MAX_SECONDS = 5;
const GROWTH = 0.35;

export function Crash() {
  const bet = useBet();
  const { setBalance } = useAccount();
  const { busy, error, send } = usePlay<CrashState>('crash');
  const [targetText, setTargetText] = useState('2.00');
  const [shown, setShown] = useState(1);
  const [round, setRound] = useState<{ state: CrashState; payout: number; bet: number; flying: boolean } | null>(null);
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
    const { point } = response.state;
    const seconds = Math.min(MAX_SECONDS, Math.log(point) / GROWTH);
    const rate = seconds > 0 ? Math.log(point) / seconds : 0;
    const startedAt = Date.now();
    setRound({ state: response.state, payout: response.payout, bet: stake, flying: true });
    setShown(1);

    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      if (elapsed >= seconds) {
        setShown(point);
        setRound((old) => old && { ...old, flying: false });
        setBalance(response.balance);
        return;
      }
      setShown(Math.exp(rate * elapsed));
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }

  const flying = Boolean(round?.flying);
  const crashed = round && !flying;
  const cashed = round && round.state.win && shown >= round.state.target;

  return (
    <GameScreen
      error={error}
      rules="El multiplicador sube hasta que explota. Eliges de antemano en cuánto cobrar: si llega a tu objetivo ganas tu apuesta por ese multiplicador; si explota antes, la pierdes. Retorno al jugador: 99 %."
      controls={
        <>
          <BetInput bet={bet} disabled={busy || flying} />
          <Field label="Cobrar en (multiplicador)" numeric value={targetText} onChangeText={setTargetText} editable={!flying} />
          <Row>
            {['1.50', '2.00', '5.00', '10.00'].map((value) => (
              <Button key={value} variant="secondary" label={`${value}×`} onPress={() => setTargetText(value)} disabled={flying} style={styles.quick} />
            ))}
          </Row>
          <Line label="Probabilidad" value={validTarget ? `${(99 / target).toFixed(2)} %` : '—'} />
          <Line strong label="Premio" value={usdt(validTarget ? round2((bet.amount ?? 0) * target) : 0)} tone="good" />
          {!validTarget && <Text style={styles.problem}>El objetivo va de 1.01× a 1000×.</Text>}
          <Button label="Despegar" onPress={play} loading={busy || flying} disabled={!bet.amount || !validTarget} />
        </>
      }>
      <Text style={{ fontSize: 44 }}>{crashed ? '💥' : '🚀'}</Text>
      <Text
        style={[
          styles.big,
          { color: crashed ? (round.state.win ? Colors.accent : Colors.danger) : flying ? Colors.text : Colors.textSecondary },
        ]}>
        {shown.toFixed(2)}×
      </Text>
      <Text style={[styles.caption, { color: Colors.accent }]}>{cashed ? `✓ Cobraste en ${round.state.target.toFixed(2)}×` : ' '}</Text>
      <Outcome payout={round?.payout} bet={round?.bet} pending={flying} idle="Elige en cuánto cobrar y despega." />
    </GameScreen>
  );
}

// ───────────── Slots ─────────────

// Mirrors SLOT_SYMBOLS of web/src/lib/games/engine.ts.
const PAYTABLE = [
  { symbol: '7️⃣', three: 150, two: 10 },
  { symbol: '💎', three: 50, two: 5 },
  { symbol: '⭐', three: 25, two: 4 },
  { symbol: '🔔', three: 14, two: 3 },
  { symbol: '🍋', three: 9, two: 2 },
  { symbol: '🍒', three: 6, two: 2 },
];
const IDLE = [
  ['🍋', '7️⃣', '🍒'],
  ['🔔', '7️⃣', '⭐'],
  ['💎', '7️⃣', '🍋'],
];
/** Shown on a reel while it is still turning, so the result is not readable early. */
const TURNING = ['❔', '❔', '❔'];
/** When each reel stops, in ms after the answer arrives. */
const STOPS = [500, 850, 1200];

export function Slots() {
  const bet = useBet();
  const { setBalance } = useAccount();
  const { busy, error, send } = usePlay<SlotsState>('slots');
  const [reels, setReels] = useState(IDLE);
  /** How many reels have stopped; 3 = at rest. */
  const [stopped, setStopped] = useState(3);
  const [last, setLast] = useState<{ payout: number; bet: number; multiplier: number } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  async function spin() {
    if (!bet.amount) return;
    const stake = bet.amount;
    setStopped(0);
    setLast(null);
    const response = await send({ bet: stake }, true);
    if (!response) return setStopped(3);

    setReels(response.state.reels);
    timers.current = STOPS.map((delay, index) =>
      setTimeout(() => {
        setStopped(index + 1);
        if (index === 2) {
          setLast({ payout: response.payout, bet: stake, multiplier: response.state.multiplier });
          setBalance(response.balance);
        }
      }, delay),
    );
  }

  const spinning = stopped < 3;

  return (
    <GameScreen
      error={error}
      rules="Paga la fila del centro, de izquierda a derecha: tres símbolos iguales, o los dos primeros iguales. Retorno al jugador: 96.7 %."
      controls={
        <>
          <BetInput bet={bet} disabled={spinning} />
          <Button label="Girar" onPress={spin} loading={busy || spinning} disabled={!bet.amount} />
          {PAYTABLE.map((row) => (
            <Line key={row.symbol} label={`${row.symbol} ×3: ${row.three}×`} value={`×2: ${row.two}×`} />
          ))}
        </>
      }>
      <View style={styles.machine}>
        {reels.map((reel, index) => (
          <View key={index} style={styles.reel}>
            {(index >= stopped ? TURNING : reel).map((symbol, row) => (
              <View key={row} style={[styles.cell, row === 1 && styles.payline]}>
                <Text style={[styles.symbol, row !== 1 && { opacity: 0.4 }]}>{symbol}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      {last && last.multiplier > 0 ? <Text style={[styles.caption, { color: Colors.gold }]}>¡{last.multiplier}× tu apuesta!</Text> : null}
      <Outcome payout={last?.payout} bet={last?.bet} idle={spinning ? 'Girando…' : '¡Suerte!'} />
    </GameScreen>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: 64, fontWeight: '900', fontVariant: ['tabular-nums'] },
  caption: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  problem: { color: Colors.gold, fontSize: 12 },
  quick: { flex: 1, minHeight: 36, paddingHorizontal: Spacing.one },
  bar: { width: '100%', height: 14, borderRadius: Radius.pill, backgroundColor: Colors.dangerSoft, overflow: 'hidden' },
  barZone: { position: 'absolute', top: 0, bottom: 0, backgroundColor: Colors.accent },
  barMarker: { position: 'absolute', top: 0, bottom: 0, width: 4, marginLeft: -2, backgroundColor: Colors.text },
  machine: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: 2,
    borderColor: Colors.gold,
    backgroundColor: Colors.background,
  },
  reel: { borderRadius: Radius.small, backgroundColor: Colors.surfaceRaised, overflow: 'hidden' },
  cell: { width: 76, height: 68, alignItems: 'center', justifyContent: 'center' },
  payline: { borderTopWidth: 2, borderBottomWidth: 2, borderColor: Colors.accent },
  symbol: { fontSize: 40 },
});
