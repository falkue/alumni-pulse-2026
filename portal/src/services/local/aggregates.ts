/**
 * Lokale Quelle für Aggregat-Dateien: holt GENAU EINE Datei einer Hochschule
 * vom Dev-Server (siehe Plugin `localAggregates` in vite.config.ts).
 *
 * Die Rechteprüfung passiert vorher im DataService (Mandantentrennung).
 * Später ersetzt der Firebase-Adapter diese Funktion durch Firestore-Lesezugriffe.
 */
import { PortalError } from '../../domain/types';
import type { AggregateKind } from '../ports';

/** Erlaubte Hochschul-IDs (S001 … oder Demo "ALL"): verhindert Pfad-Tricks wie "../". */
export const SCHOOL_ID_PATTERN = /^(S\d{3}|ALL)$/;

/** URL einer Aggregat-Datei auf dem lokalen Dev-Server. */
export function aggregateUrl(kind: AggregateKind, schoolId: string): string {
  if (!SCHOOL_ID_PATTERN.test(schoolId)) throw new PortalError('invalid-argument', 'Invalid institution ID.');
  return `/local-aggregates/${kind}/${schoolId}.json`;
}

/** Lädt eine Aggregat-Datei; 404 -> PortalError('not-found'). */
export async function fetchLocalAggregate(
  kind: AggregateKind,
  schoolId: string,
  fetchFn: typeof fetch = fetch,
): Promise<unknown> {
  const res = await fetchFn(aggregateUrl(kind, schoolId));
  if (res.status === 404) throw new PortalError('not-found', 'No analysis is available for this institution yet.');
  if (!res.ok) throw new Error(`Aggregat konnte nicht geladen werden (HTTP ${res.status}).`);
  return res.json();
}

/** Erlaubte Diagramm-IDs (Ordnernamen unter portal/insights/). */
export const CHART_ID_PATTERN = /^[a-z_]+$/;

/** URL einer KI-Interpretation auf dem lokalen Dev-Server. */
export function insightUrl(chartId: string, schoolId: string): string {
  if (!CHART_ID_PATTERN.test(chartId) || !SCHOOL_ID_PATTERN.test(schoolId)) {
    throw new PortalError('invalid-argument', 'Invalid chart or school ID.');
  }
  return `/local-insights/${chartId}/${schoolId}.json`;
}

/** Lädt eine KI-Interpretation; 404 -> null (es gibt (noch) keinen Text). */
export async function fetchLocalInsight(chartId: string, schoolId: string, fetchFn: typeof fetch = fetch): Promise<unknown | null> {
  const res = await fetchFn(insightUrl(chartId, schoolId));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`AI insight could not be loaded (HTTP ${res.status}).`);
  return res.json();
}
