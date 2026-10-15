/**
 * Kleiner Trend-Chart unter Diagramm B: eigener Median (Akzent, Lücken bei Jahren
 * ohne Wert), Benchmark-Median (gestrichelt grau), Band p25–p75 (grau) und
 * Markierung der gewählten Welle. Reines React-SVG, Farben nur über CSS-Klassen/Tokens.
 */
import type { AgeWaves } from '../../../domain/age';
import { axisTicks, fmtAge, segments, trendDomain, trendSeries } from './peersMath';

interface Props {
  waves: AgeWaves;
  benchmarkKey: string;
  year: number;
  /** false = eigene Werte unterdrückt */
  published?: boolean;
}

const W = 680;
const H = 190;
const M = { t: 12, r: 24, b: 26, l: 40 };

/** Zeichnet den Trend-Chart. */
export function AgeTrendChart({ waves, benchmarkKey, year, published = true }: Props) {
  const series = trendSeries(waves, benchmarkKey, published);
  const [lo, hi] = trendDomain(series);
  const n = Math.max(series.length - 1, 1);
  // Skalen: Jahr-Index -> x, Alter -> y (y wächst nach unten)
  const x = (y: number) => M.l + ((waves.years.indexOf(y)) / n) * (W - M.l - M.r);
  const y = (v: number) => M.t + ((hi - v) / (hi - lo)) * (H - M.t - M.b);
  const path = (seg: { year: number; v: number }[]) => seg.map((p, i) => `${i ? 'L' : 'M'}${x(p.year)},${y(p.v)}`).join(' ');

  // Band: nur zusammenhängende Jahre mit Benchmark-Daten
  const bandSegs = segments(series, (p) => p.bench?.p25 ?? null).map((seg) =>
    seg.map((s) => ({ year: s.year, lo: s.v, hi: series.find((p) => p.year === s.year)!.bench!.p75 })),
  );
  const bandPath = (seg: { year: number; lo: number; hi: number }[]) =>
    seg.map((p, i) => `${i ? 'L' : 'M'}${x(p.year)},${y(p.hi)}`).join(' ') +
    ' ' + [...seg].reverse().map((p) => `L${x(p.year)},${y(p.lo)}`).join(' ') + ' Z';

  return (
    <svg
      className="age-peers__svg age-trend__svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="Trend in median age: your school and benchmark median, with a band for the middle 50 % of schools"
      data-testid="age-trend"
    >
      {axisTicks([lo, hi], 2).map((t) => (
        <g key={t}>
          <line className="age-peers__grid" x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} />
          <text className="age-peers__tick" x={M.l - 6} y={y(t) + 4} textAnchor="end">{t}</text>
        </g>
      ))}
      {waves.years.map((yr) => (
        <text key={yr} className={`age-peers__tick${yr === year ? ' age-peers__tick--active' : ''}`} x={x(yr)} y={H - 8} textAnchor="middle">{yr}</text>
      ))}
      {/* gewählte Welle */}
      <line className="age-peers__wave-mark" data-testid="trend-selected" x1={x(year)} x2={x(year)} y1={M.t} y2={H - M.b} />
      {bandSegs.map((seg, i) => <path key={i} className="age-peers__band" d={bandPath(seg)} />)}
      {segments(series, (p) => p.bench?.median ?? null).map((seg, i) => (
        <path key={i} className="age-peers__bench-line" d={path(seg)} />
      ))}
      {segments(series, (p) => p.own).map((seg, i) => (
        <path key={i} className="age-peers__own-line" d={path(seg)} />
      ))}
      {series.filter((p) => p.own !== null).map((p) => (
        <circle key={p.year} className="age-peers__own-dot" cx={x(p.year)} cy={y(p.own!)} r={4.5}>
          <title>{`${p.year}: Median ${fmtAge(p.own!)} yrs`}</title>
        </circle>
      ))}
    </svg>
  );
}
