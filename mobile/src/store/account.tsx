import { createContext, use, useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';
import { DEFAULT_SETTINGS, type Profile, type Settings } from '@/lib/types';

type AccountState = {
  profile: Profile | null;
  balance: number;
  /** Games and bets answer with the new balance; this shows it without waiting for a reload. */
  setBalance: (balance: number) => void;
  /** True only during the first load. */
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  settings: Settings;
};

const AccountContext = createContext<AccountState | null>(null);

export function useAccount(): AccountState {
  const value = use(AccountContext);
  if (!value) throw new Error('useAccount debe usarse dentro de <AccountProvider>');
  return value;
}

/** Profile, balance and limits of the signed-in user. Mounted with `key={userId}`, so it never mixes accounts. */
export function AccountProvider({ userId, children }: PropsWithChildren<{ userId: string }>) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const [own, limits] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('settings').select('*').maybeSingle(),
    ]);
    if (own.error) setError(`No se pudo cargar tu cuenta: ${own.error.message}`);
    else {
      setError('');
      setProfile(own.data as Profile | null);
    }
    if (limits.data) setSettings(limits.data as Settings);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    // Deferred a tick: the loader sets state, which an effect body must not do synchronously.
    Promise.resolve().then(reload);
    // Deposits and settled bets change the balance from the server side.
    const channel = supabase
      .channel(`profile-${userId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, (payload) =>
        setProfile(payload.new as Profile),
      )
      .subscribe();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reload();
    });
    return () => {
      void supabase.removeChannel(channel);
      subscription.remove();
    };
  }, [userId, reload]);

  const setBalance = useCallback((balance: number) => setProfile((old) => old && { ...old, balance }), []);

  return (
    <AccountContext value={{ profile, balance: Number(profile?.balance ?? 0), setBalance, loading, error, reload, settings }}>
      {children}
    </AccountContext>
  );
}
