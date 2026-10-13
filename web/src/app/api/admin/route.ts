import { UUID, adminClient, authUser, fail, failFrom, isAdmin, json, serverConfigured } from "@/lib/server";

async function guard(request: Request) {
  if (!serverConfigured()) return fail("not_configured", 503);
  const user = await authUser(request);
  if (!user) return fail("not_authenticated", 401);
  return (await isAdmin(user)) ? null : fail("forbidden", 403);
}

/** Everything /admin shows: totals, withdrawals waiting to be paid and events that never got a result. */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const db = adminClient();

  const [stats, withdrawals, stale] = await Promise.all([
    db.rpc("admin_stats"),
    db.from("withdrawals").select("*, profiles(name)").eq("status", "pending").order("created_at"),
    // Started more than six hours ago and still without a final score.
    db
      .from("events")
      .select("id, sport_key, home_team, away_team, commence_time")
      .eq("status", "upcoming")
      .lt("commence_time", new Date(Date.now() - 6 * 3_600_000).toISOString())
      .order("commence_time")
      .limit(100),
  ]);
  if (stats.error || withdrawals.error || stale.error) return fail("server_error", 500);

  // Emails live in auth.users, which only the admin API can read.
  const pending = await Promise.all(
    withdrawals.data.map(async (withdrawal) => {
      const { data } = await db.auth.admin.getUserById(withdrawal.user_id);
      return { ...withdrawal, email: data.user?.email ?? "" };
    }),
  );
  return json({ stats: stats.data, withdrawals: pending, staleEvents: stale.data });
}

export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const db = adminClient();

  if (body?.action === "withdrawal" && UUID.test(body.id) && (body.status === "paid" || body.status === "rejected")) {
    const { error } = await db.rpc("admin_set_withdrawal", {
      p_id: body.id,
      p_status: body.status,
      p_tx_hash: typeof body.txHash === "string" ? body.txHash.trim().slice(0, 200) || null : null,
      p_note: typeof body.note === "string" ? body.note.trim().slice(0, 300) || null : null,
    });
    return error ? failFrom(error) : json({ ok: true });
  }

  if (body?.action === "settle" && typeof body.event === "string" && Number.isInteger(body.home) && Number.isInteger(body.away)) {
    if (body.home < 0 || body.away < 0) return fail("bad_request");
    const { data, error } = await db.rpc("settle_event", { p_event: body.event, p_home: body.home, p_away: body.away });
    return error ? failFrom(error) : json({ bets: data });
  }

  if (body?.action === "void" && typeof body.event === "string") {
    const { data, error } = await db.rpc("void_event", { p_event: body.event });
    return error ? failFrom(error) : json({ bets: data });
  }

  return fail("bad_request");
}
