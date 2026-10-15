/**
 * SessionContext – hält die aktuelle Sitzung (eingeloggter Demo-User).
 *
 * Beim Start wird einmalig `auth.currentSession()` geladen (Loading-Zustand),
 * danach bieten signIn/signOut die Änderungen an.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '../domain/types';
import { useServices } from './ServicesContext';

interface SessionState {
  session: Session | null;
  /** true, solange currentSession() noch lädt */
  loading: boolean;
  signIn: (uid: string) => Promise<Session>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

/**
 * Stellt die Session per Context bereit. Lädt beim Mount die gespeicherte Sitzung
 * (loading=true bis zur Antwort) und liefert signIn/signOut, die den State mitführen.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { auth } = useServices();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Schritt 1: gespeicherte Sitzung wiederherstellen
  useEffect(() => {
    let cancelled = false;
    auth
      .currentSession()
      .then((s) => !cancelled && setSession(s))
      .catch(() => !cancelled && setSession(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [auth]);

  const signIn = useCallback(
    async (uid: string) => {
      const s = await auth.signIn(uid); // wirft PortalError bei disabled/invited
      setSession(s);
      return s;
    },
    [auth],
  );

  const signOut = useCallback(async () => {
    await auth.signOut();
    setSession(null);
  }, [auth]);

  const value = useMemo(() => ({ session, loading, signIn, signOut }), [session, loading, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * Liest die Session aus dem Context. Wirft einen Fehler, wenn der SessionProvider fehlt.
 */
export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('SessionProvider fehlt');
  return ctx;
}

/** Startseite je Rolle. */
export function homePath(session: Session): string {
  return session.role === 'admin' ? '/admin' : '/school';
}
