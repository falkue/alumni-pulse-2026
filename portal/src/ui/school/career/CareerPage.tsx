/**
 * Bereich "Career & salary": lädt den Erwerbsstatus der EIGENEN Hochschule
 * (schoolId aus der Sitzung) und zeigt das Sankey-Diagramm. Die übrigen
 * Karten des Bereichs bleiben vorerst Platzhalter (SchoolSectionPage).
 */
import { useEffect, useState } from 'react';
import type { EmploymentOverview } from '../../../domain/employment';
import type { ChartInsight } from '../../../domain/insights';
import { AiInsightCard } from '../../components/AiInsightCard';
import { PortalError } from '../../../domain/types';
import { errorMessage } from '../../format';
import { Loading } from '../../Guards';
import { useServices } from '../../ServicesContext';
import { useSession } from '../../SessionContext';
import { EmploymentSankey } from './EmploymentSankey';

/** ID des Diagramms für KI-Interpretationen (Ordner portal/insights/career_employment). */
export const EMPLOYMENT_CHART_ID = 'career_employment';

/** Lädt die Daten und rendert KI-Interpretation + Sankey (oder einen Hinweis). */
export function CareerPage() {
  const { data } = useServices();
  const { session } = useSession();
  const [overview, setOverview] = useState<EmploymentOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  // KI-Interpretation ist optional: fehlt sie (oder schlägt das Laden fehl), bleibt nur das Diagramm
  const [insight, setInsight] = useState<ChartInsight | null>(null);

  useEffect(() => {
    if (!session?.schoolId) return;
    let cancelled = false;
    data
      .getEmploymentFlow(session, session.schoolId)
      .then((o) => !cancelled && setOverview(o))
      .catch((e) => {
        if (cancelled) return;
        // Noch keine Aggregate = normaler Zustand, kein Fehler
        setError(e instanceof PortalError && e.code === 'not-found' ? 'No results are available for this school yet.' : errorMessage(e));
      });
    data
      .getChartInsight(session, session.schoolId, EMPLOYMENT_CHART_ID)
      .then((i) => !cancelled && setInsight(i))
      .catch(() => !cancelled && setInsight(null));
    return () => {
      cancelled = true;
    };
  }, [data, session]);

  if (error) return <div className="alert alert--info" role="note">{error}</div>;
  if (!overview) return <Loading />;
  // KI-Box steht VOR dem Diagramm (Leseanleitung + Benchmark)
  return (
    <div className="stack">
      {insight && <AiInsightCard insight={insight} />}
      <EmploymentSankey overview={overview} />
    </div>
  );
}
