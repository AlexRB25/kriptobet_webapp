// Shapes shared by the game engine, the API and both clients.
// Copy of web/src/lib/games/types.ts — change both.

export const GAME_IDS = ["dados", "crash", "ruleta", "slots", "minas", "blackjack"] as const;
export type GameId = (typeof GAME_IDS)[number];

export const GAMES: Record<GameId, { title: string; tagline: string; emoji: string }> = {
  crash: { title: "Crash", tagline: "Elige tu multiplicador y cobra antes de que explote", emoji: "🚀" },
  ruleta: { title: "Ruleta", tagline: "Europea, un solo cero", emoji: "🎡" },
  slots: { title: "Slots", tagline: "Tres rodillos, premios de hasta 150×", emoji: "🎰" },
  blackjack: { title: "Blackjack", tagline: "Llega a 21 sin pasarte. Paga 3 a 2", emoji: "🃏" },
  minas: { title: "Minas", tagline: "Cada casilla segura sube el premio", emoji: "💣" },
  dados: { title: "Dados", tagline: "Tú eliges la probabilidad de ganar", emoji: "🎲" },
};

/** What every game endpoint answers after a move. */
export type GameResponse<State> = {
  state: State;
  /** Amount credited by this move (0 while a round is still open or when it lost). */
  payout: number;
  balance: number;
  roundId?: string;
  bet?: number;
};

// ── Dados ──
export type DiceParams = { chance: number; direction: "under" | "over" };
export type DiceState = DiceParams & {
  /** 0.00 – 99.99 */
  roll: number;
  multiplier: number;
  win: boolean;
};

// ── Crash ──
export type CrashState = { target: number; point: number; win: boolean };

// ── Ruleta ──
export type RouletteBetType = "straight" | "red" | "black" | "even" | "odd" | "low" | "high" | "dozen" | "column";
/** `value` is the number (0–36) for a straight bet and 1–3 for dozens and columns. */
export type RouletteBet = { type: RouletteBetType; value?: number; amount: number };
export type RouletteState = { bets: RouletteBet[]; number: number; color: "red" | "black" | "green" };

export const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

export function rouletteColor(n: number): RouletteState["color"] {
  return n === 0 ? "green" : RED_NUMBERS.includes(n) ? "red" : "black";
}

// ── Slots ──
export type SlotsState = {
  /** Three reels, each with the symbols showing in the top, middle and bottom rows. Only the middle row pays. */
  reels: string[][];
  multiplier: number;
};

// ── Minas ──
export const MINES_TILES = 25;
export type MinesState = {
  mines: number;
  revealed: number[];
  /** Multiplier the player can cash out right now (0 before the first safe tile). */
  multiplier: number;
  /** Multiplier after one more safe tile, or null when the round is over. */
  next: number | null;
  over: boolean;
  /** Tile where the player hit a mine, if they did. */
  hit: number | null;
  /** Shown only once the round is over. */
  minePositions: number[] | null;
};

// ── Blackjack ──
export type Card = { rank: string; suit: "♠" | "♥" | "♦" | "♣" };
export type BlackjackOutcome = "blackjack" | "win" | "lose" | "push";
export type BlackjackState = {
  player: Card[];
  /** Only the dealer's first card until the round ends. */
  dealer: Card[];
  playerTotal: number;
  dealerTotal: number;
  outcome: BlackjackOutcome | null;
  canDouble: boolean;
};
