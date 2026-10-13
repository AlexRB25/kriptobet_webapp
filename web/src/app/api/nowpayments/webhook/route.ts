import { cryptoConfigured, refreshDeposit, type DepositRow } from "@/lib/nowpayments";
import { adminClient, serverConfigured } from "@/lib/server";

/**
 * NOWPayments calls this (IPN) when a payment changes. The notification is only a hint: the
 * payment is read again from their API before anything is credited, so a forged call cannot
 * add balance. Answering with an error makes them retry later.
 */
export async function POST(request: Request) {
  if (!serverConfigured() || !cryptoConfigured()) return new Response(null, { status: 503 });
  const body = await request.json().catch(() => null);
  const paymentId = body?.payment_id ? String(body.payment_id) : "";
  if (!/^\d{1,30}$/.test(paymentId)) return new Response(null, { status: 200 });

  const { data, error } = await adminClient().from("deposits").select("*").eq("provider_id", paymentId).maybeSingle();
  if (error) return new Response(null, { status: 502 });
  if (!data) return new Response(null, { status: 200 });
  try {
    await refreshDeposit(data as DepositRow);
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("No se pudo actualizar el depósito:", error);
    return new Response(null, { status: 502 });
  }
}
