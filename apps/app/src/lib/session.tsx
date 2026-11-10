import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

import { supabase } from './supabase';

interface SessionState {
  session: Session | null;
  /** True until the stored session has been read on startup. */
  loading: boolean;
}

const SessionContext = createContext<SessionState>({ session: null, loading: true });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, loading: true });
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setState({ session: data.session, loading: false }))
      .catch(() => setState({ session: null, loading: false }));

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState({ session, loading: false });
      // Never show one person's cached trips to the next person on the device.
      if (event === 'SIGNED_OUT') queryClient.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}

/** The signed-in user's id. Only call from screens behind the sign-in guard. */
export function useUserId(): string {
  const { session } = useSession();
  if (!session) throw new Error('useUserId called while signed out');
  return session.user.id;
}
