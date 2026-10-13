import { randomInt } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Rng } from "./games/engine";

// Server-only helpers shared by the API routes. Nothing here may be imported from a client component.

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const serverConfigured = () => Boolean(process.env.PB_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
export const demoMode = () => process.env.PB_DEMO_MODE === "1";

let client: SupabaseClient | undefined;

/** Bypasses RLS and may call every function of schema.sql. */
export function adminClient(): SupabaseClient {
  return (client ??= createClient(process.env.PB_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

/** Cryptographically secure generator for the games. */
export const rng: Rng = (max) => randomInt(max);

export const json = (data: unknown, status = 200) => Response.json(data, { status });

/** Error answer: `code` is one of the keys of lib/errors.ts, which both clients turn into a message. */
export const fail = (code: string, status = 400) => Response.json({ error: code }, { status });

/** Turns an error raised by a schema.sql function (its message is the code) into an answer. */
export function failFrom(error: { message: string; code?: string }) {
  // P0001 = `raise exception` of our own functions; anything else is unexpected.
  if (error.code === "P0001" && /^[a-z_]+$/.test(error.message)) return fail(error.message, 409);
  console.error("Error de base de datos:", error);
  return fail("server_error", 500);
}

/** Id of the signed-in user who sent the request (web and mobile send `Authorization: Bearer <access token>`). */
export async function authUser(request: Request): Promise<string | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token || !serverConfigured()) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  return error ? null : (data.user?.id ?? null);
}

export async function isAdmin(userId: string) {
  const { data } = await adminClient().from("profiles").select("is_admin").eq("id", userId).maybeSingle();
  return Boolean(data?.is_admin);
}

/** True for Vercel Cron (it sends CRON_SECRET as a bearer token) and for signed-in admins. */
export async function cronOrAdmin(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  const user = await authUser(request);
  return user ? isAdmin(user) : false;
}

export type Settings = {
  min_bet: number;
  max_bet: number;
  max_payout: number;
  max_selections: number;
  min_deposit: number;
  min_withdrawal: number;
};

let cachedSettings: { value: Settings; at: number } | undefined;

/** Limits from the `settings` table, re-read at most once a minute. */
export async function settings(): Promise<Settings> {
  if (cachedSettings && Date.now() - cachedSettings.at < 60_000) return cachedSettings.value;
  const { data, error } = await adminClient().from("settings").select("*").single();
  if (error) throw new Error(`No se pudo leer settings: ${error.message}`);
  cachedSettings = { value: data as Settings, at: Date.now() };
  return cachedSettings.value;
}

/** A money amount sent by a client: a positive number with at most two decimals, or null. */
export function amount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1e9) return null;
  return Math.round(value * 100) / 100 === value ? value : null;
}
