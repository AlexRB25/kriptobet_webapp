// Rows of supabase/schema.sql as the clients read them.
// Copy of web/src/lib/types.ts — change both.

export type Profile = {
  id: string;
  name: string;
  balance: number;
  is_admin: boolean;
  excluded_until: string | null;
  daily_deposit_limit: number | null;
};

export type Settings = {
  min_bet: number;
  max_bet: number;
  max_payout: number;
  max_selections: number;
  min_deposit: number;
  min_withdrawal: number;
};

export const DEFAULT_SETTINGS: Settings = {
  min_bet: 0.1,
  max_bet: 500,
  max_payout: 10000,
  max_selections: 12,
  min_deposit: 10,
  min_withdrawal: 20,
};

export type Sport = { key: string; title: string; group_name: string; sort: number };

export type Market = "h2h" | "totals";
export type Outcome = "home" | "draw" | "away" | "over" | "under";

export type Odd = {
  id: string;
  event_id: string;
  market: Market;
  outcome: Outcome;
  point: number | null;
  price: number;
  active: boolean;
};

export type SportEvent = {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  odds: Odd[];
};

export type BetStatus = "pending" | "won" | "lost" | "void";

export type BetSelection = {
  id: string;
  event_id: string;
  market: Market;
  outcome: Outcome;
  point: number | null;
  price: number;
  status: BetStatus;
  home_team: string;
  away_team: string;
  commence_time: string;
};

export type Bet = {
  id: string;
  stake: number;
  total_odds: number;
  potential_payout: number;
  status: BetStatus;
  payout: number;
  created_at: string;
  bet_selections: BetSelection[];
};

export type GameRound = { id: string; game: string; bet: number; payout: number; status: "open" | "done"; created_at: string };

export type LedgerEntry = { id: number; amount: number; balance_after: number; kind: string; created_at: string };

export type Deposit = {
  id: string;
  amount: number;
  pay_currency: string;
  pay_amount: number | null;
  pay_address: string | null;
  status: "waiting" | "confirming" | "credited" | "expired" | "failed";
  credited: number;
  created_at: string;
};

export type Withdrawal = {
  id: string;
  amount: number;
  network: string;
  address: string;
  status: "pending" | "paid" | "rejected";
  tx_hash: string | null;
  note: string | null;
  created_at: string;
};

/** A pick waiting in the bet slip. */
export type SlipSelection = {
  oddsId: string;
  eventId: string;
  price: number;
  /** "América vs Chivas" */
  eventName: string;
  /** "Ganador · América" */
  pick: string;
};

type Pick = { market: Market; outcome: Outcome; point: number | null; home_team: string; away_team: string };

/** What a selection bets on, in words. */
export function pickLabel(pick: Pick) {
  switch (pick.outcome) {
    case "home":
      return pick.home_team;
    case "away":
      return pick.away_team;
    case "draw":
      return "Empate";
    case "over":
      return `Más de ${pick.point}`;
    case "under":
      return `Menos de ${pick.point}`;
  }
}

export const MARKET_LABELS: Record<Market, string> = { h2h: "Ganador", totals: "Total" };

export const BET_STATUS_LABELS: Record<BetStatus, string> = { pending: "Pendiente", won: "Ganada", lost: "Perdida", void: "Anulada" };

export const LEDGER_LABELS: Record<string, string> = {
  deposit: "Depósito",
  withdrawal: "Retiro",
  withdrawal_refund: "Retiro rechazado (devuelto)",
  bet: "Apuesta deportiva",
  bet_win: "Apuesta ganada",
  bet_refund: "Apuesta anulada (devuelta)",
  game_bet: "Jugada de casino",
  game_win: "Premio de casino",
  demo: "Saldo de prueba",
  adjustment: "Ajuste",
};

export const DEPOSIT_STATUS_LABELS: Record<Deposit["status"], string> = {
  waiting: "Esperando pago",
  confirming: "Confirmando en la red",
  credited: "Acreditado",
  expired: "Expirado",
  failed: "Fallido",
};

export const WITHDRAWAL_STATUS_LABELS: Record<Withdrawal["status"], string> = { pending: "En proceso", paid: "Pagado", rejected: "Rechazado" };
