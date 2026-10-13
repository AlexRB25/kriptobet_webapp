import { COINS } from "@/lib/crypto";
import { createPayment, cryptoConfigured, refreshDeposit, type DepositRow } from "@/lib/nowpayments";
import { UUID, adminClient, amount, authUser, fail, failFrom, json, serverConfigured } from "@/lib/server";

/** Creates a deposit and answers with the address and exact amount the user has to send. */
export async function POST(request: Request) {
  if (!serverConfigured()) return fail("not_configured", 503);
  const user = await authUser(request);
  if (!user) return fail("not_authenticated", 401);
  if (!cryptoConfigured()) return fail("crypto_not_configured", 503);

  const body = await request.json().catch(() => null);
  const usd = amount(body?.amount);
  if (!usd || !COINS.some((coin) => coin.id === body?.currency)) return fail("bad_request");

  const db = adminClient();
  const opened = await db.rpc("open_deposit", { p_user: user, p_amount: usd, p_currency: body.currency });
  if (opened.error) return failFrom(opened.error);
  const id = opened.data as string;

  try {
    const origin = process.env.SITE_URL || new URL(request.url).origin;
    const payment = await createPayment(id, usd, body.currency, `${origin}/api/nowpayments/webhook`);
    const { data, error } = await db
      .from("deposits")
      .update({ provider_id: String(payment.payment_id), pay_address: payment.pay_address, pay_amount: payment.pay_amount })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return json({ deposit: data });
  } catch (error) {
    console.error("No se pudo crear el pago:", error);
    await db.from("deposits").update({ status: "failed" }).eq("id", id);
    return fail("provider_error", 502);
  }
}

/** Re-checks one of the user's deposits against the processor; the wallet screen polls this while it waits. */
export async function GET(request: Request) {
  if (!serverConfigured()) return fail("not_configured", 503);
  const user = await authUser(request);
  if (!user) return fail("not_authenticated", 401);
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return fail("bad_request");

  const { data } = await adminClient().from("deposits").select("*").eq("id", id).eq("user_id", user).maybeSingle();
  if (!data) return fail("bad_request", 404);
  if (!cryptoConfigured()) return json({ deposit: data });
  try {
    return json({ deposit: await refreshDeposit(data as DepositRow) });
  } catch (error) {
    console.error("No se pudo consultar el pago:", error);
    return json({ deposit: data });
  }
}
