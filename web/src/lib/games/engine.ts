import type {
  BlackjackOutcome,
  BlackjackState,
  Card,
  CrashState,
  DiceParams,
  DiceState,
  MinesState,
  RouletteBet,
  RouletteState,
  SlotSymbol,
  SlotWin,
  SlotsState,
} from "./types.ts";
import { SLOT_LINES, SLOT_PAYS } from "./types.ts";

// Pure game rules. Every function takes its randomness as a parameter, so the API passes a
// cryptographic generator and the tests pass a scripted one. Nothing here touches money in the
// database: callers turn `multiplier`/`payout` into wallet movements.

/** Returns a uniform integer in [0, max). */
export type Rng = (max: number) => number;

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const floor2 = (value: number) => Math.floor(value * 100 + 1e-9) / 100;

/** Share of every bet the games return in the long run (slots and blackjack have their own). */
export const RTP = 0.99;

// ───────────── Dados ─────────────

export const DICE_MIN_CHANCE = 1;
export const DICE_MAX_CHANCE = 95;

export function validDice(params: DiceParams) {
  return (
    Number.isFinite(params.chance) &&
    params.chance >= DICE_MIN_CHANCE &&
    params.chance <= DICE_MAX_CHANCE &&
    (params.direction === "under" || params.direction === "over")
  );
}

/** Payout per unit bet for a win chance given in percent. */
export function diceMultiplier(chance: number) {
  return Math.floor((RTP * 1_000_000) / Math.round(chance * 100)) / 100;
}

export function playDice(params: DiceParams, rng: Rng): DiceState {
  const threshold = Math.round(params.chance * 100);
  const roll = rng(10_000);
  const win = params.direction === "under" ? roll < threshold : roll >= 10_000 - threshold;
  return { chance: threshold / 100, direction: params.direction, roll: roll / 100, multiplier: diceMultiplier(params.chance), win };
}

// ───────────── Crash ─────────────

export const CRASH_MIN_TARGET = 1.01;
export const CRASH_MAX_TARGET = 1000;
const CRASH_CAP = 10_000;
const CRASH_STEPS = 1_000_000_000;

/** The round crashes at `point`; the player wins if it reaches their target. P(point ≥ t) = 0.99 / t. */
export function playCrash(target: number, rng: Rng): CrashState {
  const u = rng(CRASH_STEPS) / CRASH_STEPS;
  const point = Math.min(CRASH_CAP, Math.max(1, Math.floor((RTP * 100) / (1 - u)) / 100));
  return { target, point, win: point >= target };
}

// ───────────── Ruleta ─────────────

const ROULETTE_PAYS: Record<RouletteBet["type"], number> = {
  straight: 35,
  red: 1,
  black: 1,
  even: 1,
  odd: 1,
  low: 1,
  high: 1,
  dozen: 2,
  column: 2,
};
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export function validRouletteBets(bets: unknown): bets is RouletteBet[] {
  if (!Array.isArray(bets) || bets.length < 1 || bets.length > 40) return false;
  return bets.every((bet) => {
    if (!bet || typeof bet !== "object" || !(bet.type in ROULETTE_PAYS)) return false;
    if (!Number.isFinite(bet.amount) || bet.amount <= 0 || round2(bet.amount) !== bet.amount) return false;
    if (bet.type === "straight") return Number.isInteger(bet.value) && bet.value >= 0 && bet.value <= 36;
    if (bet.type === "dozen" || bet.type === "column") return bet.value === 1 || bet.value === 2 || bet.value === 3;
    return true;
  });
}

export function rouletteBetWins(bet: RouletteBet, n: number) {
  switch (bet.type) {
    case "straight":
      return bet.value === n;
    case "red":
      return RED.has(n);
    case "black":
      return n !== 0 && !RED.has(n);
    case "even":
      return n !== 0 && n % 2 === 0;
    case "odd":
      return n % 2 === 1;
    case "low":
      return n >= 1 && n <= 18;
    case "high":
      return n >= 19;
    case "dozen":
      return n !== 0 && Math.ceil(n / 12) === bet.value;
    case "column":
      return n !== 0 && ((n - 1) % 3) + 1 === bet.value;
  }
}

export function playRoulette(bets: RouletteBet[], rng: Rng): { state: RouletteState; bet: number; payout: number } {
  const n = rng(37);
  let payout = 0;
  let bet = 0;
  for (const item of bets) {
    bet += item.amount;
    if (rouletteBetWins(item, n)) payout += item.amount * (ROULETTE_PAYS[item.type] + 1);
  }
  const color = n === 0 ? "green" : RED.has(n) ? "red" : "black";
  return { state: { bets, number: n, color }, bet: round2(bet), payout: round2(payout) };
}

// ───────────── Slots ─────────────
// Five reels, three rows, five fixed paylines. The bet is split evenly between the lines; a line
// pays for two or more equal symbols starting from the left reel.

/** How many times each symbol appears on a reel strip. Together with SLOT_PAYS this sets the return (≈ 96.4 %). */
export const SLOT_COUNTS: Record<SlotSymbol, number> = { lemon: 6, cherry: 7, orange: 6, bell: 5, star: 4, diamond: 3, seven: 2 };

// Dealt round-robin so that equal symbols are never neighbours on the strip, not even across its ends.
export const SLOT_STRIP: SlotSymbol[] = (() => {
  const pools = (Object.keys(SLOT_COUNTS) as SlotSymbol[]).map((symbol) => ({ symbol, left: SLOT_COUNTS[symbol] }));
  const strip: SlotSymbol[] = [];
  while (pools.some((pool) => pool.left > 0)) {
    for (const pool of pools) {
      if (pool.left > 0) {
        strip.push(pool.symbol);
        pool.left--;
      }
    }
  }
  return strip;
})();

/** What a line pays, in line bets, for `count` equal symbols from the left. */
export function slotLinePays(symbol: SlotSymbol, count: number) {
  return count >= 2 ? SLOT_PAYS[symbol][count - 2] : 0;
}

/** Winning lines of a grid given as five reels of three rows each. */
export function slotWins(reels: SlotSymbol[][]): SlotWin[] {
  const wins: SlotWin[] = [];
  SLOT_LINES.forEach((rows, line) => {
    const symbol = reels[0][rows[0]];
    let count = 1;
    while (count < rows.length && reels[count][rows[count]] === symbol) count++;
    const pays = slotLinePays(symbol, count);
    if (pays > 0) wins.push({ line, symbol, count, pays });
  });
  return wins;
}

export function playSlots(rng: Rng): SlotsState {
  const size = SLOT_STRIP.length;
  const reels = SLOT_LINES[0].map(() => {
    const stop = rng(size);
    return [SLOT_STRIP[(stop + size - 1) % size], SLOT_STRIP[stop], SLOT_STRIP[(stop + 1) % size]];
  });
  const wins = slotWins(reels);
  // Each line carries a fifth of the bet, so the payout per unit bet is the lines' pays divided by five.
  return { reels, wins, multiplier: round2(wins.reduce((sum, win) => sum + win.pays, 0) / SLOT_LINES.length) };
}

// ───────────── Minas ─────────────

const TILES = 25;
export type MinesSecret = { positions: number[] };

export const validMineCount = (mines: unknown): mines is number => Number.isInteger(mines) && (mines as number) >= 1 && (mines as number) <= 24;

/** Payout per unit bet after `safe` tiles revealed without hitting any of `mines`. */
export function minesMultiplier(mines: number, safe: number) {
  if (safe <= 0) return 0;
  let odds = 1;
  for (let i = 0; i < safe; i++) odds *= (TILES - i) / (TILES - mines - i);
  return floor2(RTP * odds);
}

function minesView(mines: number, revealed: number[], hit: number | null, secret: MinesSecret | null): MinesState {
  const cleared = revealed.length === TILES - mines;
  const over = hit !== null || secret !== null;
  return {
    mines,
    revealed,
    multiplier: hit !== null ? 0 : minesMultiplier(mines, revealed.length),
    next: over || cleared ? null : minesMultiplier(mines, revealed.length + 1),
    over,
    hit,
    minePositions: secret ? secret.positions : null,
  };
}

export function startMines(mines: number, rng: Rng): { state: MinesState; secret: MinesSecret } {
  const tiles = Array.from({ length: TILES }, (_, index) => index);
  // Partial Fisher–Yates: the first `mines` slots end up holding a uniform sample.
  for (let i = 0; i < mines; i++) {
    const j = i + rng(TILES - i);
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return { state: minesView(mines, [], null, null), secret: { positions: tiles.slice(0, mines).sort((a, b) => a - b) } };
}

/** Reveals a tile. `done` means the round ended: on a mine (multiplier 0) or with the board cleared (auto cash-out). */
export function revealMine(state: MinesState, secret: MinesSecret, tile: number): { state: MinesState; done: boolean } | null {
  if (state.over || !Number.isInteger(tile) || tile < 0 || tile >= TILES || state.revealed.includes(tile)) return null;
  if (secret.positions.includes(tile)) return { state: minesView(state.mines, state.revealed, tile, secret), done: true };
  const revealed = [...state.revealed, tile];
  const cleared = revealed.length === TILES - state.mines;
  return { state: minesView(state.mines, revealed, null, cleared ? secret : null), done: cleared };
}

export function cashOutMines(state: MinesState, secret: MinesSecret): MinesState | null {
  if (state.over || state.revealed.length === 0) return null;
  return minesView(state.mines, state.revealed, null, secret);
}

// ───────────── Blackjack ─────────────
// Infinite deck, dealer stands on every 17, blackjack pays 3 to 2, double on the first two cards, no splits.

const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["♠", "♥", "♦", "♣"] as const;

/** Full hand as the server keeps it; the player only sees the dealer's first card until the end. */
export type BlackjackSecret = { dealer: Card[] };

export function drawCard(rng: Rng): Card {
  const index = rng(52);
  return { rank: RANKS[index % 13], suit: SUITS[Math.floor(index / 13)] };
}

export function handTotal(cards: Card[]) {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    if (card.rank === "A") {
      aces++;
      total += 11;
    } else total += Number(card.rank) || 10;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

const isNatural = (cards: Card[]) => cards.length === 2 && handTotal(cards) === 21;

function blackjackView(player: Card[], dealer: Card[], outcome: BlackjackOutcome | null): BlackjackState {
  const shown = outcome ? dealer : dealer.slice(0, 1);
  return {
    player,
    dealer: shown,
    playerTotal: handTotal(player),
    dealerTotal: handTotal(shown),
    outcome,
    canDouble: !outcome && player.length === 2,
  };
}

/** Times the total bet that each outcome returns. */
export const BLACKJACK_RETURNS: Record<BlackjackOutcome, number> = { blackjack: 2.5, win: 2, push: 1, lose: 0 };

function finishBlackjack(player: Card[], dealer: Card[], rng: Rng): BlackjackState {
  const hand = [...dealer];
  while (handTotal(hand) < 17) hand.push(drawCard(rng));
  const mine = handTotal(player);
  const theirs = handTotal(hand);
  const outcome: BlackjackOutcome = theirs > 21 || mine > theirs ? "win" : mine === theirs ? "push" : "lose";
  return blackjackView(player, hand, outcome);
}

export function dealBlackjack(rng: Rng): { state: BlackjackState; secret: BlackjackSecret } {
  const player = [drawCard(rng), drawCard(rng)];
  const dealer = [drawCard(rng), drawCard(rng)];
  let outcome: BlackjackOutcome | null = null;
  if (isNatural(player)) outcome = isNatural(dealer) ? "push" : "blackjack";
  else if (isNatural(dealer)) outcome = "lose";
  return { state: blackjackView(player, dealer, outcome), secret: { dealer } };
}

export type BlackjackAction = "hit" | "stand" | "double";

/** Plays one action on an open hand. Returns null if the action is not allowed. The round is over when `state.outcome` is set. */
export function actBlackjack(state: BlackjackState, secret: BlackjackSecret, action: BlackjackAction, rng: Rng): BlackjackState | null {
  if (state.outcome) return null;
  if (action === "stand") return finishBlackjack(state.player, secret.dealer, rng);
  if (action === "double" && !state.canDouble) return null;
  if (action !== "hit" && action !== "double") return null;

  const player = [...state.player, drawCard(rng)];
  const total = handTotal(player);
  if (total > 21) return blackjackView(player, secret.dealer, "lose");
  if (total === 21 || action === "double") return finishBlackjack(player, secret.dealer, rng);
  return blackjackView(player, secret.dealer, null);
}
