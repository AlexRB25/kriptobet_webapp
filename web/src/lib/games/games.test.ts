import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { test } from "node:test";
import {
  SLOT_COUNTS,
  SLOT_STRIP,
  actBlackjack,
  cashOutMines,
  dealBlackjack,
  diceMultiplier,
  handTotal,
  minesMultiplier,
  playCrash,
  playDice,
  playRoulette,
  revealMine,
  rouletteBetWins,
  slotLinePays,
  slotWins,
  playSlots,
  startMines,
  validRouletteBets,
  BLACKJACK_RETURNS,
  type Rng,
} from "./engine.ts";
import type { Card, RouletteBet, SlotSymbol } from "./types.ts";

const random: Rng = (max) => randomInt(max);
/** Generator that returns the given values in order. */
const scripted = (...values: number[]): Rng => () => {
  const next = values.shift();
  if (next === undefined) throw new Error("rng agotado");
  return next;
};
const card = (rank: string): Card => ({ rank, suit: "♠" });
/** Index that drawCard turns into the given rank. */
const draw = (rank: string) => ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].indexOf(rank);

test("dados: el retorno es 99 % para cualquier probabilidad", () => {
  for (const chance of [1, 2.5, 33.33, 50, 95]) {
    for (const direction of ["under", "over"] as const) {
      let wins = 0;
      for (let roll = 0; roll < 10_000; roll++) if (playDice({ chance, direction }, () => roll).win) wins++;
      assert.equal(wins, Math.round(chance * 100));
      const rtp = (wins / 10_000) * diceMultiplier(chance);
      assert.ok(rtp <= 0.99 + 1e-9 && rtp > 0.97, `rtp ${rtp} con ${chance}`);
    }
  }
  assert.equal(diceMultiplier(50), 1.98);
});

test("crash: gana justo cuando el punto alcanza el objetivo", () => {
  assert.equal(playCrash(2, () => 0).point, 1);
  // u = 0.505 → 0.99 / 0.495 = 2.00
  assert.deepEqual(playCrash(2, () => 505_000_000), { target: 2, point: 2, win: true });
  assert.equal(playCrash(2, () => 504_000_000).win, false);
  assert.equal(playCrash(1000, () => 999_999_999).point, 10_000);
});

test("crash: la probabilidad de ganar es 0.99 / objetivo", () => {
  const rounds = 200_000;
  for (const target of [1.5, 2, 10]) {
    let wins = 0;
    for (let i = 0; i < rounds; i++) if (playCrash(target, random).win) wins++;
    assert.ok(Math.abs(wins / rounds - 0.99 / target) < 0.006, `objetivo ${target}: ${wins / rounds}`);
  }
});

test("ruleta: cada tipo de apuesta devuelve 36/37", () => {
  const types: RouletteBet[] = [
    { type: "straight", value: 17, amount: 1 },
    { type: "straight", value: 0, amount: 1 },
    { type: "red", amount: 1 },
    { type: "black", amount: 1 },
    { type: "even", amount: 1 },
    { type: "odd", amount: 1 },
    { type: "low", amount: 1 },
    { type: "high", amount: 1 },
    { type: "dozen", value: 2, amount: 1 },
    { type: "column", value: 3, amount: 1 },
  ];
  for (const bet of types) {
    let returned = 0;
    for (let n = 0; n <= 36; n++) returned += playRoulette([bet], () => n).payout;
    assert.equal(returned, 36, JSON.stringify(bet));
  }
  assert.equal(rouletteBetWins({ type: "column", value: 1, amount: 1 }, 34), true);
  assert.equal(rouletteBetWins({ type: "dozen", value: 3, amount: 1 }, 36), true);
  assert.equal(rouletteBetWins({ type: "even", amount: 1 }, 0), false);
});

test("ruleta: suma varias apuestas y rechaza las mal formadas", () => {
  const result = playRoulette(
    [
      { type: "straight", value: 7, amount: 1 },
      { type: "red", amount: 2.5 },
      { type: "black", amount: 4 },
    ],
    () => 7,
  );
  assert.equal(result.bet, 7.5);
  assert.equal(result.payout, 36 + 5);
  assert.equal(result.state.color, "red");
  assert.equal(validRouletteBets([{ type: "straight", value: 37, amount: 1 }]), false);
  assert.equal(validRouletteBets([{ type: "red", amount: -1 }]), false);
  assert.equal(validRouletteBets([{ type: "red", amount: 0.001 }]), false);
  assert.equal(validRouletteBets([{ type: "dozen", amount: 1 }]), false);
  assert.equal(validRouletteBets([]), false);
});

test("slots: retorno por línea entre 95 % y 97 %", () => {
  const symbols = Object.keys(SLOT_COUNTS) as SlotSymbol[];
  const size = SLOT_STRIP.length;
  // Each line reads one independent symbol per reel, so the return of the game is the return of one line.
  let returned = 0;
  let hits = 0;
  for (const symbol of symbols) {
    const p = SLOT_COUNTS[symbol] / size;
    for (let count = 2; count <= 5; count++) {
      const chance = count === 5 ? p ** 5 : p ** count * (1 - p);
      returned += chance * slotLinePays(symbol, count);
      hits += chance;
    }
  }
  assert.ok(returned > 0.95 && returned < 0.97, `rtp ${returned}`);
  assert.ok(hits > 0.12);
  assert.equal(size, 33);
  for (let i = 0; i < size; i++) assert.notEqual(SLOT_STRIP[i], SLOT_STRIP[(i + 1) % size]);
});

test("slots: líneas ganadoras", () => {
  const column = (top: SlotSymbol, middle: SlotSymbol, bottom: SlotSymbol) => [top, middle, bottom];
  // Centro: 3 sietes. Arriba: 2 limones. Abajo: nada. V: limón-siete-campana. V invertida: campana-siete-limón.
  const reels = [
    column("lemon", "seven", "bell"),
    column("lemon", "seven", "cherry"),
    column("star", "seven", "orange"),
    column("bell", "diamond", "star"),
    column("lemon", "orange", "bell"),
  ];
  assert.deepEqual(slotWins(reels), [
    { line: 0, symbol: "seven", count: 3, pays: 100 },
    { line: 1, symbol: "lemon", count: 2, pays: 2 },
  ]);
  // Pantalla llena del mismo símbolo: las cinco líneas pagan cinco iguales.
  const full = Array.from({ length: 5 }, () => column("cherry", "cherry", "cherry"));
  assert.equal(slotWins(full).length, 5);
  // Una tirada: rejilla de 5×3 y multiplicador = pagos ÷ 5.
  const spin = playSlots(() => 0);
  assert.equal(spin.reels.length, 5);
  assert.ok(spin.reels.every((reel) => reel.length === 3));
  assert.equal(spin.multiplier, spin.wins.reduce((sum, win) => sum + win.pays, 0) / 5);
  // Los cinco rodillos paran igual: pagan las tres líneas horizontales.
  assert.equal(spin.wins.length, 3);
});

test("minas: multiplicadores y retorno", () => {
  assert.equal(minesMultiplier(3, 0), 0);
  // 1 mina, 1 casilla: 0.99 × 25/24
  assert.equal(minesMultiplier(1, 1), 1.03);
  assert.equal(minesMultiplier(24, 1), 24.75);
  // P(sobrevivir k casillas) × multiplicador ≤ 0.99
  for (const mines of [1, 3, 10, 24]) {
    let survive = 1;
    for (let k = 1; k <= 25 - mines; k++) {
      survive *= (25 - mines - (k - 1)) / (25 - (k - 1));
      const rtp = survive * minesMultiplier(mines, k);
      assert.ok(rtp <= 0.99 + 1e-9 && rtp > 0.9, `minas ${mines}, casillas ${k}: ${rtp}`);
    }
  }
});

test("minas: partida completa", () => {
  const { state, secret } = startMines(5, random);
  assert.equal(secret.positions.length, 5);
  assert.equal(new Set(secret.positions).size, 5);
  assert.equal(state.minePositions, null);
  assert.equal(cashOutMines(state, secret), null);

  const safe = [...Array(25).keys()].filter((tile) => !secret.positions.includes(tile));
  const first = revealMine(state, secret, safe[0])!;
  assert.equal(first.done, false);
  assert.equal(first.state.multiplier, minesMultiplier(5, 1));
  assert.equal(first.state.minePositions, null);
  assert.equal(revealMine(first.state, secret, safe[0]), null);

  const cashed = cashOutMines(first.state, secret)!;
  assert.equal(cashed.over, true);
  assert.deepEqual(cashed.minePositions, secret.positions);
  assert.equal(revealMine(cashed, secret, safe[1]), null);

  const boom = revealMine(first.state, secret, secret.positions[0])!;
  assert.equal(boom.done, true);
  assert.equal(boom.state.multiplier, 0);
  assert.equal(boom.state.hit, secret.positions[0]);

  // Despejar todo el tablero cobra solo.
  let current = state;
  for (const tile of safe) {
    const step = revealMine(current, secret, tile)!;
    current = step.state;
    assert.equal(step.done, tile === safe[safe.length - 1]);
  }
  assert.equal(current.multiplier, minesMultiplier(5, 20));
  assert.equal(current.next, null);
});

test("blackjack: totales", () => {
  assert.equal(handTotal([card("A"), card("K")]), 21);
  assert.equal(handTotal([card("A"), card("A"), card("9")]), 21);
  assert.equal(handTotal([card("A"), card("7"), card("9")]), 17);
  assert.equal(handTotal([card("K"), card("Q"), card("5")]), 25);
});

test("blackjack: reparto y jugadas", () => {
  // Jugador A+K, crupier 9+7 → blackjack.
  let deal = dealBlackjack(scripted(draw("A"), draw("K"), draw("9"), draw("7")));
  assert.equal(deal.state.outcome, "blackjack");
  assert.equal(deal.state.dealer.length, 2);

  // Los dos con blackjack → empate.
  deal = dealBlackjack(scripted(draw("A"), draw("K"), draw("Q"), draw("A")));
  assert.equal(deal.state.outcome, "push");

  // Blackjack del crupier → pierde sin jugar.
  deal = dealBlackjack(scripted(draw("9"), draw("K"), draw("Q"), draw("A")));
  assert.equal(deal.state.outcome, "lose");

  // Mano abierta: solo se ve la primera carta del crupier.
  deal = dealBlackjack(scripted(draw("5"), draw("6"), draw("10"), draw("6")));
  assert.equal(deal.state.outcome, null);
  assert.equal(deal.state.dealer.length, 1);
  assert.equal(deal.state.dealerTotal, 10);
  assert.equal(deal.state.canDouble, true);

  // Pide 4 → 15, ya no puede doblar; se planta y el crupier (16) saca 10 y se pasa.
  const hit = actBlackjack(deal.state, deal.secret, "hit", scripted(draw("4")))!;
  assert.equal(hit.playerTotal, 15);
  assert.equal(hit.canDouble, false);
  assert.equal(actBlackjack(hit, deal.secret, "double", random), null);
  const stand = actBlackjack(hit, deal.secret, "stand", scripted(draw("10")))!;
  assert.equal(stand.outcome, "win");
  assert.equal(stand.dealerTotal, 26);
  assert.equal(actBlackjack(stand, deal.secret, "hit", random), null);

  // Dobla con 11, saca 10 → 21; el crupier (16) saca 5 → 21: empate.
  const double = actBlackjack(deal.state, deal.secret, "double", scripted(draw("10"), draw("5")))!;
  assert.equal(double.outcome, "push");

  // Se pasa.
  const bust = actBlackjack(hit, deal.secret, "hit", scripted(draw("K")))!;
  assert.equal(bust.outcome, "lose");
  assert.equal(bust.dealer.length, 2);
});

test("blackjack: el retorno jugando con una estrategia simple ronda el 97–100 %", () => {
  const rounds = 300_000;
  let returned = 0;
  for (let i = 0; i < rounds; i++) {
    const { state, secret } = dealBlackjack(random);
    let current = state;
    // Pedir hasta 17 contra carta alta del crupier, hasta 12 contra carta baja.
    while (!current.outcome) {
      const limit = current.dealerTotal >= 7 ? 17 : 12;
      current = actBlackjack(current, secret, current.playerTotal < limit ? "hit" : "stand", random)!;
    }
    returned += BLACKJACK_RETURNS[current.outcome];
  }
  const rtp = returned / rounds;
  assert.ok(rtp > 0.96 && rtp < 1.0, `rtp ${rtp}`);
});
