/**
 * Demo-Direkteinstieg (nur lokale Demo): meldet einen Demo-Account per Link an,
 * damit man sich nicht jedes Mal über die Login-Seite anmelden muss.
 *
 *   /demo                     -> Hochschule S001, Überblick
 *   /demo/S022                -> Hochschule S022
 *   /demo/S022/demographics   -> Hochschule S022, Bereich "Wer hat geantwortet?"
 *   /demo/ALL                 -> gepoolte Demo-Sicht "alle Hochschulen"
 *   /demo/admin               -> Admin-Sicht
 *
 * Eine bestehende Sitzung wird dabei ersetzt. Deaktivierte oder nicht
 * freigeschaltete Accounts bleiben gesperrt (gleiche Regeln wie beim Login).
 * Ohne Demo-Modus (Firebase) leitet die Route einfach zum Login.
 */
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from './format';
import { Loading } from './Guards';
import { useServices } from './ServicesContext';
import { homePath, useSession } from './SessionContext';

/** Standard-Hochschule, wenn der Link keine angibt. */
export const DEFAULT_DEMO_SCHOOL = 'S001';

/**
 * Übersetzt den Link-Teil in eine Demo-uid:
 * "admin" -> "admin-demo", "S022"/"s022" -> "u-S022", leer -> Standard-Hochschule.
 * Unbekanntes Format -> null.
 */
export function demoUidFor(who: string | undefined): string | null {
  if (!who) return `u-${DEFAULT_DEMO_SCHOOL}`;
  if (who.toLowerCase() === 'admin') return 'admin-demo';
  const id = who.toUpperCase();
  return /^(S\d{3}|ALL)$/.test(id) ? `u-${id}` : null;
}

/** Route-Komponente für /demo/:who?/:sectionId? */
export function DemoEntry() {
  const { demoMode } = useServices();
  const { signIn } = useSession();
  const { who, sectionId } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!demoMode) return;
    // Schritt 1: Link -> Demo-Account
    const uid = demoUidFor(who);
    if (!uid) {
      setError('Unknown demo link. Examples: /demo/S001, /demo/admin');
      return;
    }
    // Schritt 2: anmelden (wirft bei deaktiviert / nicht freigeschaltet)
    let cancelled = false;
    signIn(uid)
      .then((s) => {
        if (cancelled) return;
        // Schritt 3: zur Startseite der Rolle bzw. direkt in den gewünschten Bereich
        const target = s.role === 'school' && sectionId ? `/school/${sectionId}` : homePath(s);
        navigate(target, { replace: true });
      })
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [demoMode, who, sectionId, signIn, navigate]);

  if (!demoMode) return <Navigate to="/login" replace />;
  if (error) {
    return (
      <div className="login">
        <div className="login__inner">
          <div className="alert alert--error" role="alert">{error}</div>
          <p>
            <Link to="/login">Back to demo sign-in</Link>
          </p>
        </div>
      </div>
    );
  }
  return <Loading />;
}
