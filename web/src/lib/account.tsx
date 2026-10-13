"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, use, useCallback, useEffect, useState, type PropsWithChildren } from "react";
import { supabase } from "./supabase";
import { DEFAULT_SETTINGS, type Profile, type Settings } from "./types";

type AccountState = {
  session: Session | null;
  /** True until the stored session has been read. */
  loading: boolean;
  profile: Profile | null;
  balance: number;
  /** Games and bets answer with the new balance; this shows it without waiting for a reload. */
  setBalance: (balance: number) => void;
  refresh: () => Promise<void>;
  settings: Settings;
};

const AccountContext = createContext<AccountState | null>(null);

export function useAccount(): AccountState {
  const value = use(AccountContext);
  if (!value) throw new Error("useAccount debe usarse dentro de <AccountProvider>");
  return value;
}

export function AccountProvider({ children }: PropsWithChildren) {
  const [auth, setAuth] = useState<{ session: Session | null; loading: boolean }>({ session: null, loading: true });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const userId = auth.session?.user.id;

  useEffect(() => {
    // Fires once on load with the stored session, then on every sign-in, sign-out and refresh.
    const { data } = supabase().auth.onAuthStateChange((_event, session) => setAuth({ session, loading: false }));
    supabase()
      .from("settings")
      .select("*")
      .maybeSingle()
      .then(({ data }) => data && setSettings(data as Settings));
    return () => data.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase().from("profiles").select("*").eq("id", userId).maybeSingle();
    if (data) setProfile(data as Profile);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    Promise.resolve().then(refresh);
    // Deposits and settled bets change the balance from the server side.
    const channel = supabase()
      .channel(`profile-${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, (payload) =>
        setProfile(payload.new as Profile),
      )
      .subscribe();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      void supabase().removeChannel(channel);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, refresh]);

  // A profile left over from another account is never shown.
  const current = profile && profile.id === userId ? profile : null;
  const setBalance = useCallback((balance: number) => setProfile((old) => old && { ...old, balance }), []);

  return (
    <AccountContext value={{ ...auth, profile: current, balance: Number(current?.balance ?? 0), setBalance, refresh, settings }}>
      {children}
    </AccountContext>
  );
}
