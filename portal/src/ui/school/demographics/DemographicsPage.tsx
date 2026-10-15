/**
 * Bereich "Wer hat geantwortet?" (Frage 1, Alter) der Hochschul-Sicht.
 *
 * Ablauf:
 *  1. eigene schoolId aus der Sitzung nehmen (nie aus der URL -> Mandantentrennung)
 *  2. Stand 2026 (getAgeOverview) und Wellen (getAgeWaves) parallel über den DataService laden
 *  3. Diagramm A (Alterspyramide) und Diagramm B (Median-Alter vs. Peers) anzeigen
 * Fehlen die Wellen, wird nur Diagramm A gezeigt.
 */
import { useEffect, useState } from 'react';
import type { AgeOverview, AgeWaves } from '../../../domain/age';
import { PortalError } from '../../../domain/types';
import { errorMessage } from '../../format';
import { Loading } from '../../Guards';
import { useServices } from '../../ServicesContext';
import { useSession } from '../../SessionContext';
import { AgePeersChart } from './AgePeersChart';
import { AgePyramid } from './AgePyramid';

interface LoadState {
  overview: AgeOverview | null;
  waves: AgeWaves | null;
  error: string | null;
  loading: boolean;
}

/** Noch keine Aggregate (not-found) ist kein Fehler, sondern ein normaler Zustand. */
function loadErrorText(err: unknown): string {
  if (err instanceof PortalError && err.code === 'not-found') return 'No results are available for this school yet.';
  return errorMessage(err);
}

/** Lädt die Alters-Aggregate der EIGENEN Hochschule und rendert beide Diagramme. */
export function DemographicsPage() {
  const { data } = useServices();
  const { session } = useSession();
  const [state, setState] = useState<LoadState>({ overview: null, waves: null, error: null, loading: true });

  useEffect(() => {
    if (!session?.schoolId) return;
    let cancelled = false;
    const schoolId = session.schoolId;
    // allSettled: fehlen nur die Wellen, bleibt Diagramm A trotzdem sichtbar
    Promise.allSettled([data.getAgeOverview(session, schoolId), data.getAgeWaves(session, schoolId)]).then(
      ([o, w]) => {
        if (cancelled) return;
        setState({
          overview: o.status === 'fulfilled' ? o.value : null,
          waves: w.status === 'fulfilled' ? w.value : null,
          error: o.status === 'rejected' ? loadErrorText(o.reason) : null,
          loading: false,
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [data, session]);

  if (state.loading) return <Loading />;
  if (state.error || !state.overview) {
    return (
      <div className="alert alert--info" role="note">
        {state.error ?? 'No results are available for this school yet.'}
      </div>
    );
  }

  return (
    <div className="stack">
      <AgePyramid overview={state.overview} />
      {state.waves && <AgePeersChart overview={state.overview} waves={state.waves} />}
    </div>
  );
}
