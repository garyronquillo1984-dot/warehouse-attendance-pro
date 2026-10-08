// The signed-in parent's account (profile + trial + subscription), from one RPC.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { useT } from './i18n';
import type { Account } from './types';

interface AccountState {
  account: Account | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<Account | null>;
}

const Ctx = createContext<AccountState>({ account: null, loading: true, error: null, refresh: async () => null });

export function AccountProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { setLang } = useT();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userId = session?.user.id ?? null;

  const refresh = useCallback(async () => {
    if (!userId) { setAccount(null); setLoading(false); return null; }
    const { data, error: e } = await supabase.rpc('my_account');
    if (e) { setError(e.message); setLoading(false); return null; }
    setAccount(data as Account);
    setError(null);
    setLoading(false);
    return data as Account;
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    refresh().then(a => {
      if (a) {
        setLang(a.locale);
        void supabase.rpc('track_event', { p_event: 'app_opened' });   // once a day, server-side dedupe
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  // The trial can run out while the app is open: re-check when the parent comes back.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  return <Ctx.Provider value={{ account, loading, error, refresh }}>{children}</Ctx.Provider>;
}

export const useAccount = () => useContext(Ctx);
