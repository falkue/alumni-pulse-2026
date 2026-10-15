/**
 * Route-Guards.
 * - RequireRole: lässt nur die passende Rolle durch (sonst Login bzw. eigene Startseite).
 * - HomeRedirect: "/" und unbekannte Pfade -> je nach Session.
 */
import { Navigate, Outlet } from 'react-router-dom';
import type { Role } from '../domain/types';
import { homePath, useSession } from './SessionContext';

/**
 * Platzhalter für Ladezustände (role="status"), z. B. während die Session geladen wird.
 */
export function Loading() {
  return (
    <p role="status" className="muted" style={{ padding: 'var(--space-6)' }}>
      Loading…
    </p>
  );
}

/**
 * Layout-Route-Guard: rendert die Kinder (Outlet) nur, wenn die Session die Rolle `role` hat.
 * Ohne Session -> /login, falsche Rolle -> eigene Startseite, solange die Session lädt -> Loading.
 */
export function RequireRole({ role }: { role: Role }) {
  const { session, loading } = useSession();
  // 1. Session noch unbekannt -> Ladezustand
  if (loading) return <Loading />;
  // 2. Keine Session -> Login
  if (!session) return <Navigate to="/login" replace />;
  // 3. Falsche Rolle -> zur eigenen Startseite
  if (session.role !== role) return <Navigate to={homePath(session)} replace />;
  return <Outlet />;
}

/**
 * Leitet "/" und unbekannte Pfade weiter: eingeloggt -> Startseite der Rolle, sonst -> /login.
 */
export function HomeRedirect() {
  const { session, loading } = useSession();
  if (loading) return <Loading />;
  return <Navigate to={session ? homePath(session) : '/login'} replace />;
}
