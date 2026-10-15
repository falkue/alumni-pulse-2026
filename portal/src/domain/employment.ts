/**
 * Karriere, Frage 1 (Erwerbsstatus, job_employed + Folgefragen): Mapping der
 * Pipeline-Kennzahl `career.employment.flow` in Strukturen für das Sankey-Diagramm.
 *
 * Werte sind ANTEILE in % aller Befragten (keine Personenzahlen).
 *   null = Zelle ausgeblendet (Kleinzellenschutz: 1–2 Personen bzw. Sekundärunterdrückung)
 *   0    = niemand
 * null wird NIE als 0 behandelt.
 *
 * Quelle lokal: aggregates/schools/<id>.json -> metrics["career.employment.flow"],
 * dieselbe Struktur in jedem benchmarks[key].metrics.
 */
import { benchmarkLabel } from './age';

/** Ein Blatt (Detailstatus) eines Hauptastes. */
export interface FlowLeaf {
  key: string; // Pipeline-Schlüssel, z. B. "part_time"
  label: string; // Anzeige, z. B. "Part-time"
  value: number | null; // % aller Befragten, null = ausgeblendet
}

/** Hauptast "Employed" bzw. "Not employed". */
export interface FlowBranch {
  key: 'employed' | 'not_employed';
  label: string;
  total: number | null; // % aller Befragten
  leaves: FlowLeaf[];
}

/** Erwerbsstatus einer Hochschule oder Vergleichsgruppe. */
export interface EmploymentFlow {
  n: number | null;
  branches: [FlowBranch, FlowBranch];
}

/** Alles für das Diagramm: eigene Werte + Benchmarks. */
export interface EmploymentOverview {
  schoolId: string;
  published: boolean;
  isDemo: boolean;
  /** Region der Hochschule (für den Segment-Button "Region …"), null bei ALL */
  region: string | null;
  own: EmploymentFlow | null;
  benchmarks: { key: string; label: string; flow: EmploymentFlow }[];
}

/** Blätter in Anzeige-Reihenfolge (wie in der abgenommenen Referenz, plus "Student"). */
export const EMPLOYED_LEAVES: [string, string][] = [
  ['full_time', 'Full-time'],
  ['part_time', 'Part-time'],
  ['self_employed', 'Self-employed'],
  ['other_employment', 'Other employment'],
];
export const NOT_EMPLOYED_LEAVES: [string, string][] = [
  ['seeking_work', 'Seeking work'],
  ['not_seeking_work', 'Not seeking work'],
  ['student', 'Student'],
  ['retired', 'Retired'],
  ['other_situation', 'Other situation'],
];

/** Zahl oder null (null bleibt null; fehlend/ungültig -> null). */
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Einen Hauptast aus dem Roh-Objekt lesen. */
function mapBranch(raw: unknown, key: FlowBranch['key'], label: string, leaves: [string, string][]): FlowBranch {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    key,
    label,
    total: numOrNull(o.total),
    leaves: leaves.map(([k, l]) => ({ key: k, label: l, value: numOrNull(o[k]) })),
  };
}

/**
 * Roh-Kennzahl `career.employment.flow` -> EmploymentFlow.
 * Fehlt die Kennzahl ganz, kommt null zurück.
 */
export function mapEmploymentFlow(raw: unknown): EmploymentFlow | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const employed = mapBranch(o.employed, 'employed', 'Employed', EMPLOYED_LEAVES);
  const notEmployed = mapBranch(o.not_employed, 'not_employed', 'Not employed', NOT_EMPLOYED_LEAVES);
  // Ist nur ein Ast-Total ausgeblendet, ergibt es sich aus 100 % minus dem anderen
  if (employed.total === null && notEmployed.total !== null) employed.total = round1(100 - notEmployed.total);
  if (notEmployed.total === null && employed.total !== null) notEmployed.total = round1(100 - employed.total);
  return { n: numOrNull(o.n), branches: [employed, notEmployed] };
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Schul-Aggregat (aggregates/schools/<id>.json) -> EmploymentOverview.
 * published=false -> keine eigenen Werte (Mindestfallzahl), Benchmarks bleiben.
 */
export function mapEmploymentOverview(raw: unknown): EmploymentOverview {
  const doc = (raw ?? {}) as Record<string, any>;
  const published = doc.published === true;
  const benchmarks = Object.entries((doc.benchmarks ?? {}) as Record<string, any>)
    .map(([key, b]) => ({ key, label: benchmarkLabel(key), flow: mapEmploymentFlow(b?.metrics?.['career.employment.flow']) }))
    .filter((b): b is { key: string; label: string; flow: EmploymentFlow } => b.flow !== null);
  const region = typeof doc.school?.region === 'string' && doc.demo !== true ? doc.school.region : null;
  return {
    schoolId: String(doc.school?.school_id ?? ''),
    published,
    isDemo: doc.demo === true,
    region,
    own: published ? mapEmploymentFlow(doc.metrics?.['career.employment.flow']) : null,
    benchmarks,
  };
}

/** Eine Auswahl im Segment-Control des Diagramms. */
export interface FlowOption {
  key: string; // "own" oder Benchmark-Schlüssel
  label: string;
  flow: EmploymentFlow;
}

/**
 * Segment-Control: "Your school" / "Region <eigene Region>" / "All schools".
 * Demo-Sicht ALL: "All schools" + alle Regionen (keine "eigene" Zeile, da identisch).
 */
export function flowOptions(o: EmploymentOverview): FlowOption[] {
  const byKey = new Map(o.benchmarks.map((b) => [b.key, b]));
  const opts: FlowOption[] = [];
  if (o.isDemo) {
    const all = byKey.get('all');
    if (all) opts.push({ key: 'all', label: 'All schools', flow: all.flow });
    for (const b of o.benchmarks) if (b.key.startsWith('region=')) opts.push({ key: b.key, label: b.label, flow: b.flow });
    return opts;
  }
  if (o.own) opts.push({ key: 'own', label: 'Your school', flow: o.own });
  const region = o.region ? byKey.get(`region=${o.region}`) : undefined;
  if (region) opts.push({ key: region.key, label: region.label, flow: region.flow });
  const all = byKey.get('all');
  if (all) opts.push({ key: 'all', label: 'All schools', flow: all.flow });
  return opts;
}

/** Anteil Erwerbstätige (für die Kopfzeile "72.4 % employed"), null wenn unbekannt. */
export function employedShare(flow: EmploymentFlow): number | null {
  return flow.branches[0].total;
}
