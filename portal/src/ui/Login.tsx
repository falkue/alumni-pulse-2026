/**
 * Login-Seite (/login) – nur Demo: Auswahl eines vorhandenen Accounts, kein Passwort.
 * Deaktivierte/eingeladene Accounts sind wählbar; der Login schlägt dann mit
 * verständlicher Meldung fehl.
 */
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import type { UserAccount } from '../domain/types';
import { AccountStatusBadge } from './components/Badge';
import { errorMessage } from './format';
import { Loading } from './Guards';
import { useServices } from './ServicesContext';
import { homePath, useSession } from './SessionContext';

/**
 * Demo-Login: listet vorhandene Accounts (mit Suche), Klick meldet den Account an
 * und leitet auf die Startseite der Rolle weiter. Fehler werden als englische Meldung angezeigt.
 * Bereits eingeloggte Nutzer werden direkt weitergeleitet.
 */
export function LoginPage() {
  const { auth } = useServices();
  const { session, loading, signIn } = useSession();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Demo-Accounts laden
  useEffect(() => {
    let cancelled = false;
    auth
      .listDemoAccounts()
      .then((a) => !cancelled && setAccounts(a))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [auth]);

  const admins = accounts.filter((a) => a.role === 'admin');
  const schoolAccounts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts
      .filter((a) => a.role === 'school')
      .filter((a) => !q || [a.displayName, a.email, a.schoolId ?? ''].some((v) => v.toLowerCase().includes(q)));
  }, [accounts, query]);

  async function login(uid: string) {
    setError(null);
    setBusy(true);
    try {
      const s = await signIn(uid);
      navigate(homePath(s), { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  // Bereits angemeldet -> direkt zur Startseite
  if (session) return <Navigate to={homePath(session)} replace />;

  return (
    <div className="login">
      <div className="login__inner">
        <div className="alert alert--demo" role="note">
          <strong>Local demo – no real sign-in.</strong> There is no password; only demo data is used.
        </div>
        <div className="page-head">
          <h1>Global Alumni <em>Pulse</em> 2026</h1>
          <p className="muted">Institution portal – please choose a demo account.</p>
        </div>

        {error && (
          <div className="alert alert--error" role="alert">
            {error}
          </div>
        )}

        <section className="card" aria-labelledby="login-admin">
          <h2 id="login-admin">Administration</h2>
          {admins.map((a) => (
            <button key={a.uid} type="button" className="btn btn--primary" disabled={busy} onClick={() => login(a.uid)}>
              Sign in as admin ({a.displayName})
            </button>
          ))}
        </section>

        <section className="card" aria-labelledby="login-schools">
          <h2 id="login-schools">Institution accounts</h2>
          <div className="field">
            <label htmlFor="account-search">Search accounts</label>
            <input
              id="account-search"
              className="input"
              type="search"
              placeholder="Name, email or institution ID"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ul className="account-list" aria-label="Institution accounts">
            {schoolAccounts.map((a) => (
              <li key={a.uid}>
                <button type="button" className="account-item" disabled={busy} onClick={() => login(a.uid)}>
                  <span>
                    <span>{a.displayName}</span>
                    <br />
                    <span className="small muted">
                      {a.schoolId} · {a.email}
                    </span>
                  </span>
                  <AccountStatusBadge status={a.status} />
                </button>
              </li>
            ))}
            {schoolAccounts.length === 0 && <li className="muted" style={{ padding: 'var(--space-3)' }}>No accounts found.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
