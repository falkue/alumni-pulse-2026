/**
 * Ansichts-Umschalter (nur lokale Demo): wechselt in der Seitenleiste direkt
 * zwischen Admin und den Hochschul-Accounts – ohne Abmelden und Login-Seite.
 *
 * Angeboten werden nur Accounts, die sich anmelden dürfen (Status "aktiv").
 * Beim Wechsel zwischen zwei Hochschulen bleibt der geöffnete Bereich erhalten
 * (z. B. /school/demographics), damit man Hochschulen schnell vergleichen kann.
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { UserAccount } from '../domain/types';
import { errorMessage } from './format';
import { useServices } from './ServicesContext';
import { homePath, useSession } from './SessionContext';

/**
 * Ziel-URL nach dem Wechsel: Hochschule -> Hochschule behält den Bereich,
 * sonst Startseite der neuen Rolle.
 */
export function switchTarget(currentPath: string, newRole: 'admin' | 'school'): string {
  if (newRole === 'school' && currentPath.startsWith('/school/')) return currentPath;
  return newRole === 'admin' ? '/admin' : '/school';
}

/** Auswahlfeld "Ansicht (Demo)" mit Admin + allen aktiven Hochschul-Accounts. */
export function DemoSwitcher() {
  const { auth, demoMode } = useServices();
  const { session, signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Demo-Accounts einmal laden; nur aktive sind wählbar
  useEffect(() => {
    if (!demoMode) return;
    let cancelled = false;
    auth.listDemoAccounts().then((list) => {
      if (!cancelled) setAccounts(list.filter((a) => a.status === 'active'));
    });
    return () => {
      cancelled = true;
    };
  }, [auth, demoMode]);

  if (!demoMode || !session || accounts.length === 0) return null;

  async function handleChange(uid: string) {
    setError(null);
    try {
      const s = await signIn(uid);
      navigate(s.role === 'admin' ? homePath(s) : switchTarget(location.pathname, s.role), { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const admins = accounts.filter((a) => a.role === 'admin');
  const schools = accounts.filter((a) => a.role === 'school');

  return (
    <div className="demo-switcher">
      <label htmlFor="demo-switcher" className="small muted">Switch view (demo)</label>
      <select id="demo-switcher" className="input" value={session.uid} onChange={(e) => handleChange(e.target.value)}>
        <optgroup label="Administration">
          {admins.map((a) => (
            <option key={a.uid} value={a.uid}>{a.displayName}</option>
          ))}
        </optgroup>
        <optgroup label="Institutions">
          {schools.map((a) => (
            <option key={a.uid} value={a.uid}>
              {a.schoolId} · {a.displayName}
            </option>
          ))}
        </optgroup>
      </select>
      {error && <p role="alert" className="small">{error}</p>}
    </div>
  );
}
