import { supabase } from "./supabase";

/** Failure of an API call; `code` is a key of lib/errors.ts. */
export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/** Calls this site's API as the signed-in user. With a body it is a POST, without one a GET. */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const { data } = await supabase().auth.getSession();
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("network");
  }
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(json?.error ?? "server_error");
  return json as T;
}

/** Code of anything thrown by `api` or returned as an error by a Supabase RPC. */
export function errorCode(error: unknown): string {
  if (error instanceof ApiError) return error.code;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return /^[a-z_]+$/.test(error.message) ? error.message : /fetch|network/i.test(error.message) ? "network" : "server_error";
  }
  return "server_error";
}
