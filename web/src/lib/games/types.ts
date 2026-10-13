// Shapes shared by the game engine, the API and both clients.
// The mobile app keeps a copy in mobile/src/lib/games.ts — change both.

export const GAME_IDS = ["dados", "crash", "ruleta", "slots", "minas", "blackjack"] as const;
export type GameId = (typeof GAME_IDS)[number];

export const GAMES: Record<GameId, { title: string; tagline: string; emoji: string }> = {
  crash: { title: "Crash", tagline: "Elige tu multiplicador y cobra antes de que explote", emoji: "🚀" },
  ruleta: { title: "Ruleta", tagline: "Europea, un solo cero", emoji: "🎡" },
  slots: { title: "Slots", tagline: "Cinco rodillos y cinco líneas de pago", emoji: "🎰" },
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

/** Pockets of the European wheel, clockwise from the zero. */
export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

export function rouletteColor(n: number): RouletteState["color"] {
  return n === 0 ? "green" : RED_NUMBERS.includes(n) ? "red" : "black";
}

// ── Slots ──
export const SLOT_SYMBOL_IDS = ["seven", "diamond", "star", "bell", "orange", "lemon", "cherry"] as const;
export type SlotSymbol = (typeof SLOT_SYMBOL_IDS)[number];

/** Row (0 = top, 2 = bottom) that each payline crosses on each of the five reels. */
export const SLOT_LINES = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
];

/** What 2, 3, 4 and 5 equal symbols from the left pay on a line, in line bets (a line bet is a fifth of the bet). */
export const SLOT_PAYS: Record<SlotSymbol, [number, number, number, number]> = {
  seven: [10, 100, 400, 2000],
  diamond: [5, 50, 200, 1000],
  star: [4, 30, 100, 500],
  bell: [3, 18, 60, 250],
  orange: [2, 11, 30, 100],
  lemon: [2, 11, 30, 100],
  cherry: [2, 9, 25, 80],
};

export type SlotWin = { line: number; symbol: SlotSymbol; count: number; pays: number };
export type SlotsState = {
  /** Five reels, each with the symbols showing in the top, middle and bottom rows. */
  reels: SlotSymbol[][];
  wins: SlotWin[];
  /** Payout per unit of the total bet. */
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
