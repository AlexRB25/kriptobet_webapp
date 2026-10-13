import { adminClient } from "./server";

// Crypto deposits through NOWPayments (https://nowpayments.io). Server only.
// A deposit is a NOWPayments "payment": they give an address and an exact amount in the coin the
// user chose, convert what arrives and forward it to the operator's payout wallet.

export const cryptoConfigured = () => Boolean(process.env.NOWPAYMENTS_API_KEY);

const baseUrl = () =>
  process.env.NOWPAYMENTS_SANDBOX === "1" ? "https://api-sandbox.nowpayments.io/v1" : "https://api.nowpayments.io/v1";

export type Payment = {
  payment_id: number | string;
  payment_status: string;
  pay_address: string;
  pay_amount: number;
  pay_currency: string;
  price_amount: number;
  price_currency: string;
  actually_paid?: number;
  order_id?: string;
};

async function nowPayments<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(baseUrl() + path, {
    ...init,
    cache: "no-store",
    headers: { "x-api-key": process.env.NOWPAYMENTS_API_KEY!, "Content-Type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message ?? `NOWPayments ${response.status}`);
  return body as T;
}

/** Asks for an address to receive `amountUsd` worth of `coin`. `depositId` comes back as `order_id`. */
export function createPayment(depositId: string, amountUsd: number, coin: string, webhookUrl: string) {
  return nowPayments<Payment>("/payment", {
    method: "POST",
    body: JSON.stringify({
      price_amount: amountUsd,
      price_currency: "usd",
      pay_currency: coin,
      order_id: depositId,
      order_description: `Deposito ${depositId}`,
      ipn_callback_url: webhookUrl,
    }),
  });
}

export const getPayment = (paymentId: string) => nowPayments<Payment>(`/payment/${encodeURIComponent(paymentId)}`);

export type DepositRow = {
  id: string;
  user_id: string;
  amount: number;
  pay_currency: string;
  pay_amount: number | null;
  pay_address: string | null;
  provider_id: string | null;
  status: "waiting" | "confirming" | "credited" | "expired" | "failed";
  credited: number;
  created_at: string;
};

/**
 * Brings a deposit up to date with what NOWPayments says about its payment, crediting the
 * balance when the money has arrived. The payment is always read from their API, never taken
 * from the caller, so the webhook and the wallet screen can both run this safely; crediting
 * happens once because `credit_deposit` ignores deposits that are already credited.
 */
export async function refreshDeposit(deposit: DepositRow): Promise<DepositRow> {
  if (!deposit.provider_id || deposit.status === "credited" || deposit.status === "failed") return deposit;
  const payment = await getPayment(deposit.provider_id);
  if (payment.order_id !== deposit.id || payment.price_currency?.toLowerCase() !== "usd") {
    console.error(`El pago ${deposit.provider_id} no corresponde al depósito ${deposit.id}`);
    return deposit;
  }
  const db = adminClient();

  if (payment.payment_status === "finished" || payment.payment_status === "partially_paid") {
    // Paying less than asked credits the same share of the amount; paying more credits no extra.
    const expected = Number(payment.pay_amount);
    const received = Number(payment.actually_paid ?? expected);
    const share = expected > 0 ? Math.min(1, received / expected) : 0;
    // Never more than the deposit recorded on our side, whatever the payment says.
    const credit = Math.floor(Math.min(Number(payment.price_amount), Number(deposit.amount)) * share * 100) / 100;
    if (!(credit > 0)) return deposit;
    const { error } = await db.rpc("credit_deposit", { p_deposit: deposit.id, p_amount: credit });
    if (error) throw new Error(error.message);
    return { ...deposit, status: "credited", credited: credit };
  }

  const status =
    payment.payment_status === "expired"
      ? "expired"
      : payment.payment_status === "failed" || payment.payment_status === "refunded"
        ? "failed"
        : payment.payment_status === "waiting"
          ? "waiting"
          : "confirming";
  if (status !== deposit.status) {
    // Never moves a deposit that another request credited in the meantime.
    await db.from("deposits").update({ status, updated_at: new Date().toISOString() }).eq("id", deposit.id).neq("status", "credited");
  }
  return { ...deposit, status };
}
