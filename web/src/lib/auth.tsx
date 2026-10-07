import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  loading: boolean;
  recovering: boolean;      // arrived through a password-reset link
  clearRecovering: () => void;
  needsCode: boolean;       // two-step sign-in is on and this session hasn't entered the code yet
  recheckCode: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null, loading: true, recovering: false, clearRecovering: () => {}, needsCode: false, recheckCode: async () => {},
});

async function codeRequired(): Promise<boolean> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return !!data && data.currentLevel === 'aal1' && data.nextLevel === 'aal2';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);

  const recheckCode = async () => setNeedsCode(await codeRequired());

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) setNeedsCode(await codeRequired());
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (!next) { setSession(null); setNeedsCode(false); setLoading(false); return; }
      // Supabase advises not to await its own calls inside this callback. The session is
      // published together with the two-step answer, so the app never flashes before the code screen.
      setTimeout(async () => { const need = await codeRequired(); setNeedsCode(need); setSession(next); setLoading(false); }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, recovering, clearRecovering: () => setRecovering(false), needsCode, recheckCode }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
