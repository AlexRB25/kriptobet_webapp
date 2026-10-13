// Coins accepted for deposits and withdrawals. `id` is the NOWPayments ticker.
// Copy of web/src/lib/crypto.ts — change both.
// Withdrawal networks must also be listed in `request_withdrawal` of supabase/schema.sql.

export const COINS = [
  { id: "usdttrc20", label: "USDT", network: "Tron (TRC20)" },
  { id: "usdtbsc", label: "USDT", network: "BNB Smart Chain (BEP20)" },
  { id: "usdterc20", label: "USDT", network: "Ethereum (ERC20)" },
  { id: "btc", label: "Bitcoin", network: "Bitcoin" },
  { id: "eth", label: "Ethereum", network: "Ethereum" },
  { id: "ltc", label: "Litecoin", network: "Litecoin" },
  { id: "trx", label: "TRON", network: "Tron" },
  { id: "sol", label: "Solana", network: "Solana" },
] as const;

export type CoinId = (typeof COINS)[number]["id"];

export function coinName(id: string) {
  const coin = COINS.find((entry) => entry.id === id);
  if (!coin) return id.toUpperCase();
  return coin.label === coin.network ? coin.label : `${coin.label} · ${coin.network}`;
}
