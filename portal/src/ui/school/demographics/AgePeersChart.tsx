/**
 * Diagramm B: "Median-Alter Ihrer Alumni im Vergleich" mit Wellen-Regler.
 * Visuelle Logik wie in der abgenommenen Referenz (docs/mockups), aber als
 * reines React-SVG ohne D3. Alle Kennzahlen kommen aus peersMath.ts / domain/age.ts.
 * Andere Hochschulen sind anonym: keine Namen/IDs, auch nicht in Tooltips/aria.
 */
import { useEffect, useMemo, useState } from 'react';
import type { AgeOverview, AgeWaves } from '../../../domain/age';
import { useIsMobile } from '../../useIsMobile';
import { AgeTrendChart } from './AgeTrendChart';
import './AgePeersChart.css';
import {
  axisTicks,
  buildRows,
  computeKpis,
  findBenchmark,
  fmtAge,
  formatDelta,
  ordinal,
  ownValue,
  ownLabel,
  rowTitle,
  scaleDomain,
  trajectoryPoints,
} from './peersMath';

/** Dauer pro Welle beim Abspielen (ms). */
const PLAY_STEP_MS = 1100;
/** CSS-Klasse für den Delta-Text anhand des Vorzeichens (formatDelta: "+…", "−…", "±…"). */
function deltaClass(text: string): string {
  const tone = text.startsWith('+') ? 'up' : text.startsWith('−') ? 'down' : 'zero';
  return `kpi__label age-peers__delta age-peers__delta--${tone}`;
}


interface Props {
  overview: AgeOverview;
  waves: AgeWaves;
}

/** Karte mit Controls, KPI-Karten, Dot-Plot und Trend-Chart. */
export function AgePeersChart({ overview, waves }: Props) {
  const published = overview.published;
  const lastIdx = waves.years.length - 1;
  const [yearIdx, setYearIdx] = useState(Math.max(lastIdx, 0)); // Default: letztes Jahr
  const [benchKey, setBenchKey] = useState(waves.benchmarks[0]?.key ?? '');
  const [showTrail, setShowTrail] = useState(true);
  const [playing, setPlaying] = useState(false);
  const mobile = useIsMobile();

  const year = waves.years[yearIdx];

  // Abspielen: pro Welle ein Timeout; am Ende stoppen. Cleanup räumt den Timer auf.
  useEffect(() => {
    if (!playing) return;
    if (yearIdx >= lastIdx) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => setYearIdx((i) => i + 1), PLAY_STEP_MS);
    return () => clearTimeout(id);
  }, [playing, yearIdx, lastIdx]);

  // Schritt 1: Daten der gewählten Welle ableiten
  const bench = findBenchmark(waves, benchKey);
  const wave = bench?.waves[year] ?? null;
  const own = ownValue(waves, year, published);
  const rows = useMemo(() => buildRows(own, wave?.peers ?? []), [own, wave]);
  const kpis = computeKpis(waves, benchKey, year, published);
  const trail = showTrail ? trajectoryPoints(waves, year, published) : [];
  const domain = useMemo(() => scaleDomain(waves), [waves]);

  if (waves.years.length === 0) {
    return <section className="card" aria-label="Median age compared"><h3>Median age of your alumni <em>compared</em></h3><p className="muted">No waves available.</p></section>;
  }

  // Schritt 2: Geometrie (viewBox). Mobil schmaler und mit 13 px hohen Zeilen.
  const W = mobile ? 360 : 680;
  const rowH = mobile ? 13 : 12; // kompakt: ~50 Hochschulen passen auf eine Bildschirmhöhe
  const M = { t: 8, r: 16, b: 28, l: mobile ? 100 : 104 }; // links Platz für "Ihre Hochschule"
  const H = M.t + M.b + Math.max(rows.length, 1) * rowH;
  const x = (v: number) => M.l + ((v - domain[0]) / (domain[1] - domain[0])) * (W - M.l - M.r);
  const yRow = (i: number) => M.t + i * rowH + rowH / 2;
  const ownIdx = rows.findIndex((r) => r.isOwn);

  const togglePlay = () => {
    if (playing) return setPlaying(false);
    if (yearIdx >= lastIdx) setYearIdx(0); // am Ende: von vorn beginnen
    setPlaying(true);
  };

  return (
    <section className="card age-peers" aria-label="Median age compared">
      <div className="row row--between">
        <h3>Median age of your alumni <em>compared</em></h3>
        {waves.simulated && <span className="badge badge--demo">Simulated history (mock-up)</span>}
      </div>
      {waves.simulated && (
        <p className="muted small">Only 2026 is based on the (synthetic) survey data; waves 2022–2025 are simulated for this mock-up.</p>
      )}

      {/* Controls */}
      <div className="age-peers__controls">
        {/* Umschalter nur, wenn es mehr als eine Vergleichsgruppe gibt (Demo "ALL": nur "All schools") */}
        {waves.benchmarks.length > 1 && (
          <div className="age-peers__seg" role="group" aria-label="Comparison group">
            {waves.benchmarks.map((b) => (
              <button key={b.key} type="button" className="age-peers__seg-btn" aria-pressed={b.key === benchKey} onClick={() => setBenchKey(b.key)}>
                {b.label}
              </button>
            ))}
          </div>
        )}
        <div className="age-peers__slider">
          <button type="button" className="age-peers__play" aria-label={playing ? 'Pause playback' : 'Play waves'} onClick={togglePlay}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <input
            type="range"
            aria-label="Wave (year)"
            min={0}
            max={lastIdx}
            step={1}
            value={yearIdx}
            aria-valuetext={`Wave ${year}`}
            onChange={(e) => {
              setPlaying(false);
              setYearIdx(Number(e.target.value));
            }}
          />
          <output className="age-peers__year" aria-live="polite" data-testid="age-year">Wave {year}</output>
        </div>
        <label className="age-peers__check">
          <input type="checkbox" checked={showTrail} onChange={(e) => setShowTrail(e.target.checked)} /> Show trajectory
        </label>
      </div>

      {/* KPI-Karten */}
      <div className="grid grid--kpi">
        {kpis.status === 'ok' && kpis.own ? (
          <>
            <div className="kpi">
              <div className="kpi__label">Median age</div>
              <div className="kpi__value">{fmtAge(kpis.own.median)}</div>
              <div className={deltaClass(formatDelta(kpis.own.deltaMedian))}>{formatDelta(kpis.own.deltaMedian)} vs previous wave</div>
            </div>
            <div className="kpi">
              <div className="kpi__label">Benchmark median</div>
              <div className="kpi__value">{kpis.benchmark ? fmtAge(kpis.benchmark.median) : '–'}</div>
              <div className={deltaClass(formatDelta(kpis.benchmark?.delta ?? null))}>{formatDelta(kpis.benchmark?.delta ?? null)} vs previous wave</div>
            </div>
            <div className="kpi">
              <div className="kpi__label">Middle 50 %</div>
              <div className="kpi__value">{Math.round(kpis.own.q1)}–{Math.round(kpis.own.q3)}</div>
              <div className="kpi__label">n = {kpis.own.n}</div>
            </div>
            {waves.isDemo ? (
              // Demo-Sicht "ALL": kein Perzentilrang (der Pool enthält alle Hochschulen)
              <div className="kpi">
                <div className="kpi__label">Schools pooled</div>
                <div className="kpi__value">{kpis.own.nSchools}</div>
                <div className="kpi__label">percentile rank n/a in the pooled view</div>
              </div>
            ) : (
              <div className="kpi">
                <div className="kpi__label">Percentile rank</div>
                {/* kurz halten, damit die Karte nicht umbricht: "12th" + "percentile of 50 schools" */}
                <div className="kpi__value">{kpis.own.rank !== null ? ordinal(kpis.own.rank) : '–'}</div>
                <div className="kpi__label">{kpis.own.rank !== null ? `percentile of ${kpis.own.nSchools} schools` : 'no comparison data'}</div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="kpi">
              <div className="kpi__label">Your school</div>
              <div className="kpi__value age-peers__kpi-text">
                {kpis.status === 'suppressed'
                  ? 'Too few responses'
                  : `Not yet in the study${kpis.joined !== null ? ` (joined ${kpis.joined})` : ''}`}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi__label">Benchmark median</div>
              <div className="kpi__value">{kpis.benchmark ? fmtAge(kpis.benchmark.median) : '–'}</div>
              <div className={deltaClass(formatDelta(kpis.benchmark?.delta ?? null))}>{formatDelta(kpis.benchmark?.delta ?? null)} vs previous wave</div>
            </div>
          </>
        )}
      </div>

      {/* Dot-Plot */}
      {rows.length === 0 ? (
        <p className="muted small">No comparison data are available for this wave.</p>
      ) : (
        <svg
          className="age-peers__svg"
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={`Median age and middle 50 % by school, wave ${year}; ${rows.length} schools, others anonymous`}
          data-testid="age-dotplot"
        >
          {axisTicks(domain, mobile ? 4 : 2).map((t) => (
            <g key={t}>
              <line className="age-peers__grid" x1={x(t)} x2={x(t)} y1={M.t} y2={H - M.b} />
              <text className="age-peers__tick" x={x(t)} y={H - 10} textAnchor="middle">{t}</text>
            </g>
          ))}
          {wave && (
            <g data-testid="benchmark-line">
              <line className="age-peers__bench" x1={x(wave.band.median)} x2={x(wave.band.median)} y1={M.t} y2={H - M.b} />
              <text className="age-peers__bench-label" x={x(wave.band.median)} y={M.t + 8} textAnchor="start" dx={3}>
                Benchmark median
              </text>
            </g>
          )}
          {rows.map((r, i) => (
            <g key={r.key} data-testid="age-row" data-own={r.isOwn ? 'true' : undefined} transform={`translate(0,${yRow(i)})`}>
              <title>{rowTitle(r, waves.isDemo)}</title>
              <line className={r.isOwn ? 'age-peers__range age-peers__range--own' : 'age-peers__range'} x1={x(r.q1)} x2={x(r.q3)} />
              {r.isOwn && trail.length > 0 && (
                <g data-testid="trajectory">
                  <path className="age-peers__trail-line" d={[...trail.map((p) => p.median), r.median].map((m, k) => `${k ? 'L' : 'M'}${x(m)},0`).join(' ')} />
                  {trail.map((p) => (
                    <circle key={p.year} className="age-peers__trail-dot" data-testid="trajectory-dot" cx={x(p.median)} cy={0} r={3}>
                      <title>{`${p.year}: Median ${fmtAge(p.median)} yrs`}</title>
                    </circle>
                  ))}
                </g>
              )}
              <circle className={r.isOwn ? 'age-peers__dot age-peers__dot--own' : 'age-peers__dot'} cx={x(r.median)} cy={0} r={r.isOwn ? 5.5 : 3.5} />
            </g>
          ))}
          {/* Zeilenlabel nur für die eigene Hochschule */}
          {ownIdx >= 0 && (
            <text className="age-peers__own-label" x={M.l - 8} y={yRow(ownIdx) + 4} textAnchor="end">{ownLabel(waves.isDemo)}</text>
          )}
        </svg>
      )}

      <p className="muted small">
        Trend 2022–2026: your school vs. benchmark (band = middle 50 % of schools)
      </p>
      <AgeTrendChart waves={waves} benchmarkKey={benchKey} year={year} published={published} />
    </section>
  );
}
