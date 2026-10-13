import { adminClient, authUser, demoMode, fail, failFrom, json, serverConfigured } from "@/lib/server";

/** Demo mode only (PB_DEMO_MODE=1): refills an empty balance with test money so the site can be tried without crypto. */
export async function POST(request: Request) {
  if (!serverConfigured()) return fail("not_configured", 503);
  if (!demoMode()) return fail("demo_disabled", 403);
  const user = await authUser(request);
  if (!user) return fail("not_authenticated", 401);
  const { data, error } = await adminClient().rpc("demo_topup", { p_user: user });
  if (error) return failFrom(error);
  return json({ balance: data });
}
