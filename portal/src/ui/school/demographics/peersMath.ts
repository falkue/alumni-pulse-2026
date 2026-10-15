/**
 * Reine Logik für Diagramm B ("Median-Alter im Vergleich").
 *
 * Alles hier ist frei von React/DOM und damit einfach testbar.
 * Grundsatz (Projektregel): Es werden KEINE neuen Kennzahlen erfunden –
 * Rang und Veränderung kommen aus den Helfern in `domain/age.ts`
 * (percentileRank, delta, joinedYear, previousYear). Andere Hochschulen
 * bleiben anonym: Zeilen tragen nur Werte, nie Namen oder IDs.
 */
import {
  delta,
  joinedYear,
  percentileRank,
  previousYear,
  type AgeWaves,
  type PeerAge,
  type WaveBenchmark,
  type WaveValue,
} from '../../../domain/age';

/** Eine Zeile des Dot-Plots: ein Punkt (Median) mit Balken q1–q3. */
export interface PeerRow {
  /** Stabiler, anonymer Schlüssel ("own" oder "peer-<laufende Nummer>") */
  key: string;
  isOwn: boolean;
  median: number;
  q1: number;
  q3: number;
}

/** Punkt der Trajectory (frühere Welle der eigenen Hochschule). */
export interface TrajectoryPoint {
  year: number;
  median: number;
}

/** Zustand der eigenen Hochschule in der gewählten Welle. */
export type OwnStatus = 'ok' | 'not-joined' | 'suppressed';

export interface WaveKpis {
  status: OwnStatus;
  /** Erstes Jahr mit eigenem Wert (für "Einstieg 2024") */
  joined: number | null;
  /** Nur bei status "ok" */
  own: {
    median: number;
    deltaMedian: number | null;
    q1: number;
    q3: number;
    n: number;
    /** Perzentilrang 0–100, null wenn keine Peers vorhanden oder Demo-Sicht "ALL" */
    rank: number | null;
    nSchools: number;
  } | null;
  /** null = für diese Welle/diesen Benchmark liegen keine Daten vor */
  benchmark: { median: number; delta: number | null; nSchools: number } | null;
}

/**
 * Baut die Zeilen einer Welle: eigene Hochschule (falls vorhanden) plus anonyme
 * Peers, aufsteigend nach Median sortiert. Gleichstand: eigene Zeile zuerst,
 * danach Reihenfolge der Lieferung (stabile Sortierung).
 * Fehlende q1/q3 eines Peers werden durch den Median ersetzt (Balken der Länge 0).
 */
export function buildRows(own: WaveValue | null, peers: PeerAge[]): PeerRow[] {
  const rows: PeerRow[] = peers.map((p, i) => ({
    key: `peer-${i}`,
    isOwn: false,
    median: p.median,
    q1: p.q1 ?? p.median,
    q3: p.q3 ?? p.median,
  }));
  // Eigene Zeile an den Anfang, damit sie bei Gleichstand vor den Peers steht
  if (own) rows.unshift({ key: 'own', isOwn: true, median: own.median, q1: own.q1, q3: own.q3 });
  return rows.sort((a, b) => a.median - b.median);
}

/** Findet den gewählten Benchmark (oder null). */
export function findBenchmark(waves: AgeWaves, key: string): WaveBenchmark | null {
  return waves.benchmarks.find((b) => b.key === key) ?? null;
}

/**
 * Eigener Wert einer Welle. Ist die Hochschule unterdrückt (zu wenige
 * Antworten, `published` false), gibt es nie einen eigenen Wert.
 */
export function ownValue(waves: AgeWaves, year: number, published = true): WaveValue | null {
  return published ? (waves.own[year] ?? null) : null;
}

/**
 * Skalen-Domain (Jahre) über ALLE Wellen und ALLE Benchmarks sowie die eigenen
 * Werte, damit die x-Achse beim Abspielen/Umschalten nicht springt.
 * Rundet nach außen auf ganze Jahre (+1 Puffer). Ohne Daten: Standard 20–60.
 */
export function scaleDomain(waves: AgeWaves): [number, number] {
  const values: number[] = [];
  for (const own of Object.values(waves.own)) if (own) values.push(own.q1, own.median, own.q3);
  for (const b of waves.benchmarks) {
    for (const w of Object.values(b.waves)) {
      values.push(w.band.median);
      for (const p of w.peers) values.push(p.q1 ?? p.median, p.median, p.q3 ?? p.median);
    }
  }
  if (values.length === 0) return [20, 60];
  return [Math.floor(Math.min(...values)) - 1, Math.ceil(Math.max(...values)) + 1];
}

/** Ticks im Abstand `step` innerhalb der Domain (inklusive Randwerte, die auf das Raster fallen). */
export function axisTicks(domain: [number, number], step: number): number[] {
  const ticks: number[] = [];
  for (let t = Math.ceil(domain[0] / step) * step; t <= domain[1]; t += step) ticks.push(t);
  return ticks;
}

/**
 * Trajectory: Mediane der eigenen Hochschule in den Wellen VOR dem gewählten
 * Jahr (nur Jahre mit Wert, aufsteigend). Ohne Wert in der gewählten Welle
 * gibt es keine Trajectory.
 */
export function trajectoryPoints(waves: AgeWaves, year: number, published = true): TrajectoryPoint[] {
  if (!ownValue(waves, year, published)) return [];
  return waves.years
    .filter((y) => y < year && ownValue(waves, y, published))
    .map((y) => ({ year: y, median: ownValue(waves, y, published)!.median }));
}

/**
 * KPI-Werte der gewählten Welle: eigener Median (+Δ zum Vorjahr), Benchmark-Median
 * (+Δ), mittlere 50 %, n, Perzentilrang unter eigener+Peer-Hochschulen.
 * Hat der Benchmark im Vorjahr keine Daten, ist das Δ null.
 */
export function computeKpis(waves: AgeWaves, benchmarkKey: string, year: number, published = true): WaveKpis {
  const bench = findBenchmark(waves, benchmarkKey);
  const wave = bench?.waves[year] ?? null;
  const prevYear = previousYear(waves, year);
  const prevBandMedian = prevYear !== null ? (bench?.waves[prevYear]?.band.median ?? null) : null;

  const benchmark = wave
    ? { median: wave.band.median, delta: delta(wave.band.median, prevBandMedian), nSchools: wave.band.nSchools }
    : null;

  const joined = joinedYear(waves);
  if (!published) return { status: 'suppressed', joined, own: null, benchmark };

  const own = ownValue(waves, year);
  if (!own) return { status: 'not-joined', joined, own: null, benchmark };

  const prevOwn = prevYear !== null ? (waves.own[prevYear]?.median ?? null) : null;
  const peers = wave?.peers ?? [];
  // Demo-Sicht "ALL": Der Pool enthält alle Hochschulen selbst -> ein Rang wäre sinnlos.
  // Statt Rang wird die Zahl der (anonymen) Hochschulen der Welle gemeldet.
  const ranked = waves.isDemo
    ? { rank: null, nSchools: peers.length }
    : peers.length > 0
      ? percentileRank(own.median, peers)
      : null;
  return {
    status: 'ok',
    joined,
    own: {
      median: own.median,
      deltaMedian: delta(own.median, prevOwn),
      q1: own.q1,
      q3: own.q3,
      n: own.n,
      rank: ranked?.rank ?? null,
      nSchools: ranked?.nSchools ?? 1,
    },
    benchmark,
  };
}

/** Jahre mit einer Nachkommastelle, z. B. "31.5". */
export const fmtAge = (v: number): string => v.toFixed(1);

/**
 * Englische Ordinalzahl: 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th, 21st, 52nd, 103rd.
 * 11–13 (auch 111–113) sind Sonderfälle und enden immer auf "th".
 */
export function ordinal(n: number): string {
  const lastTwo = Math.abs(n) % 100;
  const last = lastTwo % 10;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th' : last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

/** Veränderung als Text: "+0.5 yrs", "−0.5 yrs", "±0.0 yrs" oder "–" wenn nicht berechenbar. */
export function formatDelta(d: number | null): string {
  if (d === null) return '–';
  const sign = d > 0 ? '+' : d < 0 ? '−' : '±';
  return `${sign}${Math.abs(d).toFixed(1)} yrs`;
}

/**
 * Beschriftung der "eigenen" Zeile: normale Hochschule -> "Your school",
 * gepoolte Demo-Sicht (ALL) -> "All (pooled)" (Wert über alle Befragten).
 */
export function ownLabel(isDemo: boolean): string {
  return isDemo ? 'All (pooled)' : 'Your school';
}

/** Tooltip-Text einer Zeile: nur Werte, nie Namen. */
export function rowTitle(row: PeerRow, isDemo = false): string {
  const text = `Median ${fmtAge(row.median)} yrs · middle 50 %: ${fmtAge(row.q1)}–${fmtAge(row.q3)}`;
  return row.isOwn ? `${ownLabel(isDemo)}: ${text}` : text;
}

/** Ein Punkt der Trend-Reihe (pro Jahr). */
export interface TrendPoint {
  year: number;
  own: number | null;
  bench: { median: number; p25: number; p75: number } | null;
}

/** Trend-Reihe über alle Jahre für den gewählten Benchmark (Lücken = null). */
export function trendSeries(waves: AgeWaves, benchmarkKey: string, published = true): TrendPoint[] {
  const bench = findBenchmark(waves, benchmarkKey);
  return waves.years.map((year) => {
    const band = bench?.waves[year]?.band;
    return {
      year,
      own: ownValue(waves, year, published)?.median ?? null,
      bench: band ? { median: band.median, p25: band.p25, p75: band.p75 } : null,
    };
  });
}

/**
 * Teilt die Reihe in zusammenhängende Abschnitte ohne null (für Linien mit Lücken).
 * `pick` liefert den Wert pro Punkt oder null.
 */
export function segments<T extends { year: number }>(points: T[], pick: (p: T) => number | null): { year: number; v: number }[][] {
  const out: { year: number; v: number }[][] = [];
  let cur: { year: number; v: number }[] = [];
  for (const p of points) {
    const v = pick(p);
    if (v === null) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push({ year: p.year, v });
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Y-Domain des Trend-Charts (ganze Jahre, +1 Puffer); Standard 20–60. */
export function trendDomain(series: TrendPoint[]): [number, number] {
  const v: number[] = [];
  for (const p of series) {
    if (p.own !== null) v.push(p.own);
    if (p.bench) v.push(p.bench.p25, p.bench.p75);
  }
  return v.length ? [Math.floor(Math.min(...v)) - 1, Math.ceil(Math.max(...v)) + 1] : [20, 60];
}
