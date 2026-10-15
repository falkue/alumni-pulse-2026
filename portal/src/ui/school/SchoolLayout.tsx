/**
 * Rahmen der Hochschul-Sicht (/school/*): lädt NUR die eigene Hochschule,
 * zeigt den Kopf (Name, Land, Stadt, Typ, Badges, n) und die Bereichs-Navigation.
 */
import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import type { School } from '../../domain/types';
import { AppShell } from '../AppShell';
import { Badge } from '../components/Badge';
import { errorMessage, formatNumber, institutionTypeLabel } from '../format';
import { Loading } from '../Guards';
import { useServices } from '../ServicesContext';
import { useSession } from '../SessionContext';
import { SCHOOL_SECTIONS } from './sections';

/**
 * Kopfzeile "Zurich, Switzerland · Public university · Respondents (n): 28".
 * Leere Stammdaten (z. B. Demo-Sicht "ALL") werden weggelassen.
 */
export function headerFacts(school: School): string[] {
  const place = [school.city, school.country].filter(Boolean).join(', ');
  return [
    place,
    school.isDemo ? school.region : institutionTypeLabel(school.institutionType),
    `Respondents (n): ${formatNumber(school.nRespondents)}`,
  ].filter(Boolean);
}

/**
 * Layout der Hochschul-Sicht: lädt die Hochschule der Session (nie eine fremde),
 * zeigt Kopfkarte mit Akkreditierungs-Badges und Befragtenzahl, darunter die Unterseite (Outlet).
 * Zeigt Fehler oder Ladezustand, bis die Daten da sind.
 */
export function SchoolLayout() {
  const { data } = useServices();
  const { session } = useSession();
  const [school, setSchool] = useState<School | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.schoolId) return;
    let cancelled = false;
    data
      .getSchool(session, session.schoolId)
      .then((s) => !cancelled && setSchool(s))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [data, session]);

  const nav = SCHOOL_SECTIONS.map((s) => ({ to: `/school/${s.id}`, label: s.title }));

  return (
    <AppShell nav={nav} navLabel="Sections">
      {error && <div className="alert alert--error" role="alert">{error}</div>}
      {!error && !school && <Loading />}
      {school && (
        <>
          {/* Gepoolte Demo-Sicht: unübersehbarer Hinweis */}
          {school.isDemo && (
            <div className="alert alert--demo" role="note">
              <strong>Demo view: all participating schools pooled.</strong> Figures combine all respondents;
              the other schools appear only as anonymous grey dots. This is not a real institution.
            </div>
          )}
          <header className="card" aria-label="Institution">
            <div className="row row--between">
              <h1>{school.name}</h1>
              <div className="row">
                {school.aacsb && <Badge tone="accent">AACSB</Badge>}
                {school.equis && <Badge tone="accent">EQUIS</Badge>}
                {school.bgsChapter && <Badge tone="accent">Beta Gamma Sigma</Badge>}
              </div>
            </div>
            <p className="muted">{headerFacts(school).join(' · ')}</p>
          </header>
          <Outlet />
        </>
      )}
    </AppShell>
  );
}
