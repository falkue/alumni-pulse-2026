import { describe, expect, it } from 'vitest';
import { mapAgeWaves, type AgeWaves } from '../../src/domain/age';
import {
  axisTicks, buildRows, computeKpis, ownLabel, formatDelta, ordinal, ownValue, rowTitle, scaleDomain, segments, trajectoryPoints, trendSeries,
} from '../../src/ui/school/demographics/peersMath';
import { rawWavesAll, rawWavesLateJoiner } from '../fixtures/age';

const waves: AgeWaves = mapAgeWaves(rawWavesLateJoiner);

describe('buildRows', () => {
  it('fügt die eigene Zeile ein und sortiert nach Median', () => {
    const rows = buildRows({ median: 32.5, q1: 28, q3: 36, n: 21 }, [{ median: 35, q1: 30, q3: 40 }, { median: 30, q1: null, q3: null }]);
    expect(rows.map((r) => r.median)).toEqual([30, 32.5, 35]);
    expect(rows.filter((r) => r.isOwn)).toHaveLength(1);
    expect(rows[0]).toMatchObject({ q1: 30, q3: 30 }); // fehlende Quartile -> Median
  });
  it('ohne eigenen Wert nur Peers; bei Gleichstand eigene zuerst', () => {
    expect(buildRows(null, [{ median: 1, q1: 1, q3: 1 }])).toHaveLength(1);
    const tie = buildRows({ median: 30, q1: 28, q3: 32, n: 5 }, [{ median: 30, q1: 29, q3: 31 }]);
    expect(tie[0].isOwn).toBe(true);
  });
  it('Zeilen enthalten keine Namen/IDs', () => {
    expect(Object.keys(buildRows(null, [{ median: 1, q1: 1, q3: 1 }])[0]).sort()).toEqual(['isOwn', 'key', 'median', 'q1', 'q3']);
  });
});

describe('scaleDomain / axisTicks', () => {
  it('deckt alle Wellen und Benchmarks ab', () => {
    // min 26 (Peer q1 2026), max 42 (nicht vorhanden) -> max 40 -> [25, 41]
    expect(scaleDomain(waves)).toEqual([25, 41]);
  });
  it('Standard ohne Daten', () => {
    expect(scaleDomain({ ...waves, own: {}, benchmarks: [] })).toEqual([20, 60]);
  });
  it('Ticks im Raster', () => {
    expect(axisTicks([25, 41], 4)).toEqual([28, 32, 36, 40]);
  });
});

describe('trajectoryPoints', () => {
  it('nur frühere Jahre mit Wert', () => {
    expect(trajectoryPoints(waves, 2026)).toEqual([{ year: 2024, median: 30 }, { year: 2025, median: 31 }]);
    expect(trajectoryPoints(waves, 2024)).toEqual([]);
  });
  it('leer, wenn in der gewählten Welle kein Wert (später Einstieg) oder unterdrückt', () => {
    expect(trajectoryPoints(waves, 2022)).toEqual([]);
    expect(trajectoryPoints(waves, 2026, false)).toEqual([]);
  });
});

describe('computeKpis', () => {
  it('vollständige Welle 2026 (Benchmark "all")', () => {
    const k = computeKpis(waves, 'all', 2026);
    expect(k.status).toBe('ok');
    expect(k.own).toMatchObject({ median: 32.5, deltaMedian: 1.5, q1: 28, q3: 36, n: 21, nSchools: 4 });
    // Peers 35, 32.5, 30 + eigene 32.5: unter 32.5 -> 1, gleich -> 2 => (1+1)/4 = 50 %
    expect(k.own!.rank).toBe(50);
    // Vorjahr 2025 hat keine Benchmark-Daten -> Δ null
    expect(k.benchmark).toEqual({ median: 34, delta: null, nSchools: 4 });
  });
  it('Gleichstand beim Rang zählt halb', () => {
    const w = { ...waves, own: { ...waves.own, 2026: { median: 30, q1: 28, q3: 36, n: 21 } } };
    // Peers 35, 32.5, 30; eigene 30 -> 0 darunter, 2 gleich -> 1/4 = 25
    expect(computeKpis(w, 'all', 2026).own!.rank).toBe(25);
  });
  it('später Einstieg: Welle 2022 ohne eigenen Wert', () => {
    const k = computeKpis(waves, 'all', 2022);
    expect(k.status).toBe('not-joined');
    expect(k.joined).toBe(2024);
    expect(k.own).toBeNull();
    expect(k.benchmark?.median).toBe(33);
  });
  it('Jahr ohne Benchmark-Daten', () => {
    const k = computeKpis(waves, 'all', 2025);
    expect(k.benchmark).toBeNull();
    expect(k.own!.rank).toBeNull();
    expect(k.own!.deltaMedian).toBe(1);
  });
  it('Δ des Benchmarks, wenn Vorjahr vorhanden', () => {
    const w = { ...waves, benchmarks: [{ key: 'x', label: 'x', waves: {
      2025: { band: { median: 33, p25: 32, p75: 34, nSchools: 2 }, peers: [] },
      2026: { band: { median: 34.5, p25: 32, p75: 34, nSchools: 2 }, peers: [] } } }] };
    expect(computeKpis(w, 'x', 2026).benchmark?.delta).toBe(1.5);
  });
  it('unbekannter Benchmark und unterdrückte Hochschule', () => {
    expect(computeKpis(waves, 'nope', 2026).benchmark).toBeNull();
    expect(computeKpis(waves, 'all', 2026, false).status).toBe('suppressed');
  });
});

describe('Formatierung und Trend', () => {
  it('formatDelta', () => {
    expect(formatDelta(0.5)).toBe('+0.5 yrs');
    expect(formatDelta(-0.5)).toBe('−0.5 yrs');
    expect(formatDelta(0)).toBe('±0.0 yrs');
    expect(formatDelta(null)).toBe('–');
  });
  it('rowTitle nur Werte', () => {
    const r = { key: 'own', isOwn: true, median: 31.5, q1: 27.75, q3: 36.25 };
    expect(rowTitle(r)).toBe('Your school: Median 31.5 yrs · middle 50 %: 27.8–36.3');
    expect(rowTitle({ ...r, isOwn: false, key: 'peer-0' })).toBe('Median 31.5 yrs · middle 50 %: 27.8–36.3');
  });
  it('ownValue und trendSeries mit Lücken', () => {
    expect(ownValue(waves, 2022)).toBeNull();
    const s = trendSeries(waves, 'all');
    expect(s.map((p) => p.own)).toEqual([null, null, 30, 31, 32.5]);
    expect(s[0].bench?.median).toBe(33);
    expect(s[2].bench).toBeNull();
    expect(segments(s, (p) => p.bench?.median ?? null).map((g) => g.map((p) => p.year))).toEqual([[2022], [2026]]);
  });
});

describe('ordinal', () => {
  it('st/nd/rd/th nach der letzten Ziffer', () => {
    expect([1, 2, 3, 4, 21, 22, 23, 52, 100].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '21st', '22nd', '23rd', '52nd', '100th']);
  });
  it('11 bis 13 (auch 111-113) enden auf th', () => {
    expect([11, 12, 13, 111, 112, 113].map(ordinal)).toEqual(['11th', '12th', '13th', '111th', '112th', '113th']);
  });
});

describe('Demo-Sicht "ALL" (gepoolt)', () => {
  const w = mapAgeWaves(rawWavesAll);
  it('kein Perzentilrang, stattdessen Anzahl gepoolter Hochschulen', () => {
    const k = computeKpis(w, 'all', 2026);
    expect(k.status).toBe('ok');
    expect(k.own!.rank).toBeNull();
    expect(k.own!.nSchools).toBe(4);
    expect(k.own!.deltaMedian).toBe(0.5);
  });
  it('Beschriftung der eigenen Zeile', () => {
    expect(ownLabel(true)).toBe('All (pooled)');
    expect(ownLabel(false)).toBe('Your school');
    const own = buildRows(w.own[2026], w.benchmarks[0].waves[2026].peers).find((r) => r.isOwn)!;
    expect(rowTitle(own, true)).toMatch(/^All \(pooled\): Median 34.0/);
  });
});
