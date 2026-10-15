/**
 * Frage 1 (Geburtsjahr -> Alter): Datentypen und Mapping für die zwei Diagramme
 * der Hochschul-Sicht (Spezifikation: ../docs/mockups/q1_age_charts_spec.md).
 *
 * Die Pipeline liefert NUR Aggregate (snake_case, punktgetrennte Metrik-Schlüssel).
 * Diese Datei übersetzt sie in kleine, gut benannte Strukturen für die UI.
 * Grundsatz: Im Browser werden keine neuen Kennzahlen berechnet – nur
 * Veränderung zum Vorjahr (delta) und Perzentilrang aus gelieferten Werten.
 *
 * Quellen (lokal) bzw. später Firestore:
 *   aggregates/schools/<id>.json    -> mapAgeOverview()   (Firestore: aggregates/{schoolId}/sections/overview)
 *   aggregates/waves_mock/<id>.json -> mapAgeWaves()      (Firestore: aggregates/{schoolId}/waves/{year})
 */

/** Altersgruppen von oben nach unten, wie in der Pyramide dargestellt. */
export const AGE_GROUPS_TOP_DOWN = ['65+', '55-64', '45-54', '35-44', '25-34', '< 25'] as const;
export type AgeGroup = (typeof AGE_GROUPS_TOP_DOWN)[number];

/** Mindestzahl Personen pro Zelle (config/settings.yaml: reporting.min_cell_persons). */
export const MIN_CELL_PERSONS = 3;

/**
 * Eine Zeile der Alterspyramide: Anteile in % an allen Frauen+Männern der Hochschule.
 * null = Zelle aus Datenschutzgründen ausgeblendet (Kleinzellenschutz: 1–2 Personen
 * oder Sekundärunterdrückung). 0 = wirklich niemand. null ist NIE als 0 zu behandeln.
 */
export interface PyramidRow {
  group: AgeGroup;
  female: number | null;
  male: number | null;
}

/** Lage-Kennzahlen des Alters (Jahre). */
export interface AgeStats {
  median: number | null;
  q1: number | null;
  q3: number | null;
  mean: number | null;
}

/** Ein anonymer Vergleichswert (andere Hochschule) – bewusst OHNE Name/ID. */
export interface PeerAge {
  median: number;
  q1: number | null;
  q3: number | null;
}

/** Eine Vergleichsgruppe (Benchmark) für das Jahr 2026. */
export interface AgeBenchmark {
  key: string; // z. B. "all", "region=Europe"
  label: string; // deutsches Anzeige-Label
  nSchools: number;
  n: number;
  stats: AgeStats;
  pyramid: PyramidRow[] | null;
  peers: PeerAge[]; // sortiert nach Median, anonym
}

/** Alles, was Diagramm A (und die 2026-Werte von B) braucht. */
export interface AgeOverview {
  schoolId: string;
  /** false = unter Mindestfallzahl, Diagramme zeigen dann einen Hinweis statt Werten */
  published: boolean;
  n: number;
  stats: AgeStats;
  pyramid: PyramidRow[] | null;
  /**
   * Anteil (in %) "non-binary" + "keine Angabe" – nicht in der Pyramiden-Basis.
   * Summe nur der SICHTBAREN Teile; null, wenn kein Teil sichtbar ist.
   */
  excludedGenderShare: number | null;
  /** true = mindestens ein Teil (divers/keine Angabe) ist wegen < 3 Personen ausgeblendet */
  excludedGenderSuppressed: boolean;
  benchmarks: AgeBenchmark[];
  /** true = gepoolte Demo-Sicht über alle Hochschulen ("ALL"), keine echte Hochschule */
  isDemo: boolean;
  /** Anzahl gepoolter Hochschulen (nur Demo-Sicht, sonst null) */
  nSchools: number | null;
}

/** Werte der eigenen Hochschule in einer Befragungswelle. */
export interface WaveValue {
  median: number;
  q1: number;
  q3: number;
  n: number;
}

/** Benchmark-Band einer Welle (Verteilung der Hochschul-Mediane). */
export interface WaveBand {
  median: number;
  p25: number;
  p75: number;
  nSchools: number;
}

export interface WaveBenchmark {
  key: string;
  label: string;
  /** pro Jahr: Band + anonyme Peers; Jahr fehlt = keine Daten */
  waves: Record<number, { band: WaveBand; peers: PeerAge[] }>;
}

/** Zeitreihe 2022–2026 für Diagramm B. */
export interface AgeWaves {
  schoolId: string;
  /** true = Vorjahre simuliert (Mock-up) -> Badge anzeigen */
  simulated: boolean;
  /** true = gepoolte Demo-Sicht ("ALL"): kein Perzentilrang, "eigene" Zeile = Pool */
  isDemo: boolean;
  note: string;
  years: number[];
  /** null = Hochschule war in diesem Jahr noch nicht in der Studie */
  own: Record<number, WaveValue | null>;
  benchmarks: WaveBenchmark[];
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Lesbares deutsches Label für einen Benchmark-Schlüssel.
 * "region=Europe" -> "Region Europe", "aacsb=1" -> "AACSB-akkreditiert".
 */
export function benchmarkLabel(key: string): string {
  if (key === 'all') return 'All schools';
  const [dim, value = ''] = key.split('=');
  switch (dim) {
    case 'region':
      return `Region ${value}`;
    case 'ranking_tier':
      return `Ranking tier ${value}`;
    case 'institution_type':
      return {
        private_business_school: 'Private business schools',
        public_university: 'Public universities',
        applied_sciences_university: 'Universities of applied sciences',
      }[value] ?? `Type ${value.replace(/_/g, ' ')}`;
    case 'aacsb':
      return value === '1' ? 'AACSB accredited' : 'Not AACSB accredited';
    default:
      return key;
  }
}

/** Reihenfolge der Benchmark-Auswahl: Alle, Region, Tier, Typ, AACSB, Rest. */
const BENCHMARK_ORDER = ['all', 'region', 'ranking_tier', 'institution_type', 'aacsb'];
function benchmarkRank(key: string): number {
  const i = BENCHMARK_ORDER.indexOf(key.split('=')[0]);
  return i < 0 ? BENCHMARK_ORDER.length : i;
}

/** Lage-Kennzahlen aus einem metrics-Objekt der Pipeline lesen. */
function readStats(metrics: Record<string, unknown>): AgeStats {
  return {
    median: num(metrics['demographics.age.median']),
    q1: num(metrics['demographics.age.q1']),
    q3: num(metrics['demographics.age.q3']),
    mean: num(metrics['demographics.age.mean']),
  };
}

/**
 * Pyramide aus `{age_group: {female, male}}` in feste Reihenfolge bringen.
 * Gibt null zurück, wenn die Pyramide fehlt (z. B. unterdrückt).
 * Fehlende Zellen werden als 0 gelesen.
 */
export function mapPyramid(raw: unknown): PyramidRow[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const cells = raw as Record<string, { female?: unknown; male?: unknown } | undefined>;
  // Ausdrücklich null = ausgeblendet (bleibt null); fehlend/ungültig = 0
  const cell = (v: unknown): number | null => (v === null ? null : (num(v) ?? 0));
  return AGE_GROUPS_TOP_DOWN.map((group) => ({
    group,
    female: cell(cells[group]?.female),
    male: cell(cells[group]?.male),
  }));
}

/** Anzahl ausgeblendeter Zellen (null) einer Pyramide. */
export function suppressedCellCount(rows: PyramidRow[] | null): number {
  return (rows ?? []).reduce((n, r) => n + (r.female === null ? 1 : 0) + (r.male === null ? 1 : 0), 0);
}

/**
 * Summe der SICHTBAREN Pyramiden-Zellen. Ohne ausgeblendete Zellen ~100 (Rundung ±0.5);
 * mit ausgeblendeten Zellen entsprechend weniger.
 */
export function pyramidTotal(rows: PyramidRow[]): number {
  // ausgeblendete Zellen (null) zählen NICHT als 0, sondern werden übersprungen
  return rows.reduce((sum, r) => sum + (r.female ?? 0) + (r.male ?? 0), 0);
}

/** Anonyme Peers lesen und nach Median sortieren. Einträge ohne Median fallen weg. */
function mapPeers(raw: unknown, medianKey: string, q1Key: string, q3Key: string): PeerAge[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      // Bewusst NUR die Alterswerte übernehmen – keine Namen/IDs, auch falls je geliefert.
      return { median: num(o[medianKey]), q1: num(o[q1Key]), q3: num(o[q3Key]) };
    })
    .filter((p): p is PeerAge => p.median !== null)
    .sort((a, b) => a.median - b.median);
}

/**
 * Schul-Aggregat (aggregates/schools/<id>.json) -> AgeOverview.
 * Ist `published` false, werden KEINE Werte durchgereicht (Mindestfallzahl).
 */
export function mapAgeOverview(raw: unknown): AgeOverview {
  const doc = (raw ?? {}) as Record<string, any>;
  const schoolId = String(doc.school?.school_id ?? doc.school_id ?? '');
  const published = doc.published === true;
  // Demo-Sicht "ALL": Flag aus dem Dokument (Pipeline setzt "demo": true)
  const isDemo = doc.demo === true;
  const nSchools = isDemo ? num(doc.n_schools) : null;
  const metrics = (doc.metrics ?? {}) as Record<string, unknown>;

  // Benchmarks: nur Gruppen, die tatsächlich geliefert wurden
  const benchmarks: AgeBenchmark[] = Object.entries((doc.benchmarks ?? {}) as Record<string, any>)
    .map(([key, b]) => ({
      key,
      label: benchmarkLabel(key),
      nSchools: num(b?.n_schools) ?? 0,
      n: num(b?.n) ?? 0,
      stats: readStats(b?.metrics ?? {}),
      pyramid: mapPyramid(b?.metrics?.['demographics.age_gender.pyramid']),
      peers: mapPeers(b?.peers, 'demographics.age.median', 'demographics.age.q1', 'demographics.age.q3'),
    }))
    .sort((a, b) => benchmarkRank(a.key) - benchmarkRank(b.key));

  // Unterdrückt: nur Struktur + Benchmarks, keine eigenen Werte
  if (!published) {
    return {
      schoolId,
      published: false,
      n: num(doc.n) ?? 0,
      stats: { median: null, q1: null, q3: null, mean: null },
      pyramid: null,
      excludedGenderShare: null,
      excludedGenderSuppressed: false,
      benchmarks,
      isDemo,
      nSchools,
    };
  }

  // Divers ("3") und keine Angabe ("99"): null = ausgeblendet (< 3 Personen) -> nie als 0 addieren
  const gender = (metrics['demographics.gender.dist'] ?? {}) as Record<string, unknown>;
  const parts = [gender['3'], gender['99']];
  const visible = parts.map(num).filter((v): v is number => v !== null);
  const excludedGenderSuppressed = parts.some((v) => v === null);
  const excludedGenderShare = visible.length > 0 ? Math.round(visible.reduce((a, b) => a + b, 0) * 10) / 10 : null;

  return {
    schoolId,
    published: true,
    n: num(doc.n) ?? 0,
    stats: readStats(metrics),
    pyramid: mapPyramid(metrics['demographics.age_gender.pyramid']),
    excludedGenderShare,
    excludedGenderSuppressed,
    benchmarks,
    isDemo,
    nSchools,
  };
}

/** Wellen-Datei (aggregates/waves_mock/<id>.json) -> AgeWaves. */
export function mapAgeWaves(raw: unknown): AgeWaves {
  const doc = (raw ?? {}) as Record<string, any>;
  const years: number[] = Array.isArray(doc.waves)
    ? doc.waves.map(Number).filter(Number.isFinite).sort((a: number, b: number) => a - b)
    : [];

  // Eigene Werte: fehlendes Jahr oder null = noch nicht in der Studie
  const own: Record<number, WaveValue | null> = {};
  for (const y of years) {
    const v = doc.own?.[String(y)];
    const median = num(v?.median);
    own[y] = median === null ? null : { median, q1: num(v.q1) ?? median, q3: num(v.q3) ?? median, n: num(v.n) ?? 0 };
  }

  const benchmarks: WaveBenchmark[] = Object.entries((doc.benchmarks ?? {}) as Record<string, any>)
    .map(([key, b]) => {
      const waves: WaveBenchmark['waves'] = {};
      for (const y of years) {
        const w = b?.waves?.[String(y)];
        const median = num(w?.band?.median);
        if (median === null) continue;
        waves[y] = {
          band: {
            median,
            p25: num(w.band.p25) ?? median,
            p75: num(w.band.p75) ?? median,
            nSchools: num(w.band.n_schools) ?? 0,
          },
          peers: mapPeers(w.peers, 'median', 'q1', 'q3'),
        };
      }
      return { key, label: benchmarkLabel(key), waves };
    })
    .sort((a, b) => benchmarkRank(a.key) - benchmarkRank(b.key));

  return {
    schoolId: String(doc.school_id ?? ''),
    simulated: doc.simulated === true,
    isDemo: doc.demo === true,
    note: typeof doc.note === 'string' ? doc.note : '',
    years,
    own,
    benchmarks,
  };
}

/**
 * Perzentilrang der eigenen Hochschule unter allen Hochschulen der Welle
 * (eigene + Peers). Wie in der abgenommenen Referenz: Anteil mit kleinerem
 * Median, Gleichstände (inkl. der eigenen) zählen halb.
 * Ergebnis in Prozent (0–100, gerundet) und Anzahl Hochschulen.
 */
export function percentileRank(ownMedian: number, peers: PeerAge[]): { rank: number; nSchools: number } {
  const all = [ownMedian, ...peers.map((p) => p.median)];
  const below = all.filter((m) => m < ownMedian).length;
  const equal = all.filter((m) => m === ownMedian).length; // enthält die eigene Hochschule
  return { rank: Math.round((100 * (below + equal / 2)) / all.length), nSchools: all.length };
}

/** Veränderung zum Vorjahr; null, wenn ein Wert fehlt. Auf 1 Dezimale gerundet. */
export function delta(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current == null || previous == null) return null;
  return Math.round((current - previous) * 10) / 10;
}

/** Erstes Jahr mit eigenem Wert (Einstieg in die Studie) oder null. */
export function joinedYear(waves: AgeWaves): number | null {
  return waves.years.find((y) => waves.own[y] != null) ?? null;
}

/** Wert des Vorjahres (bzw. der vorherigen Welle) oder null. */
export function previousYear(waves: AgeWaves, year: number): number | null {
  const i = waves.years.indexOf(year);
  return i > 0 ? waves.years[i - 1] : null;
}
