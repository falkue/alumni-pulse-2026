/**
 * Diagramm A: Alterspyramide (eigene Hochschule vs. Benchmark).
 * Reines React-SVG, keine Zusatzbibliothek. Nur Aggregate, nie Einzelantworten.
 * Spezifikation: ../docs/mockups/q1_age_charts_spec.md (Abschnitt "Chart A").
 */
import { useId, useState } from 'react';
import { AGE_GROUPS_TOP_DOWN, suppressedCellCount, type AgeOverview, type AgeStats, type PyramidRow } from '../../../domain/age';
import { ownLabel } from './peersMath';
import { axisTicks, cellText, excludedGenderNote, HIDDEN_CELL_W, niceMax, pyramidScale, SMALL_CELL_NOTE } from './pyramidMath';
import './AgePyramid.css';

// --- Geometrie (Einheiten des viewBox, nicht Pixel) --------------------------
const W = 640; // Gesamtbreite
const SIDE = 8; // Rand links/rechts
const LABEL_W = 64; // Mittelspalte mit Gruppenlabels
const HALF = (W - 2 * SIDE - LABEL_W) / 2; // Breite einer Hälfte
const VALUE_LABEL_W = 40; // Platz am Balkenende für das Werte-Label
const BAR_AREA = HALF - VALUE_LABEL_W; // maximale Balkenlänge
const CENTER_L = SIDE + HALF; // x der linken Mittelkante (Frauen wachsen nach links)
const CENTER_R = CENTER_L + LABEL_W; // x der rechten Mittelkante (Männer wachsen nach rechts)
const HEAD_H = 28; // Spaltenköpfe
const ROW_H = 36;
const BAR_H = 20;
const AXIS_H = 30;
const H = HEAD_H + AGE_GROUPS_TOP_DOWN.length * ROW_H + AXIS_H;

const MIN_N_NOTICE = 'Fewer than 10 responses – not shown.';

/** Zahl mit en-GB-Format (Tausendertrenner Komma, Dezimalpunkt), max. 1 Dezimale. */
const fmt = (v: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(v);

/** Kopfzeile "<Name>: n = 28 · median 31.5 years". */
function statsLine(name: string, n: number, stats: AgeStats): string {
  const median = stats.median === null ? 'median –' : `median ${fmt(stats.median)} years`;
  return `${name}: n = ${fmt(n)} · ${median}`;
}

/** Zeile einer Pyramide zur Altersgruppe suchen (Benchmark kann leer sein). */
const rowOf = (rows: PyramidRow[] | null | undefined, group: string) => rows?.find((r) => r.group === group);

/**
 * Alterspyramide mit Benchmark-Auswahl.
 * @param overview Aggregat der Hochschule inkl. Benchmarks (aus mapAgeOverview)
 */
export function AgePyramid({ overview }: { overview: AgeOverview }) {
  // Schritt 1: Standardauswahl = erster Benchmark MIT Pyramide, sonst der erste
  const firstUsable = overview.benchmarks.find((b) => b.pyramid) ?? overview.benchmarks[0];
  const [selectedKey, setSelectedKey] = useState<string | undefined>(firstUsable?.key);
  // eindeutige ID für das Schraffur-Muster der ausgeblendeten Zellen
  const hatchId = `age-hatch-${useId().replace(/:/g, '')}`;

  // Schritt 2: unterdrückte Hochschule -> nur Hinweis, kein SVG
  if (!overview.published || !overview.pyramid) {
    return (
      <section className="card age-pyramid" aria-label="Age pyramid">
        <h3 className="age-pyramid__title">Age structure by <em>gender</em></h3>
        <p className="muted">{MIN_N_NOTICE}</p>
      </section>
    );
  }
  const own = overview.pyramid;
  const bench = overview.benchmarks.find((b) => b.key === selectedKey) ?? firstUsable;
  const benchRows = bench?.pyramid ?? null;

  // Schritt 3: gemeinsame Skala über eigene UND Benchmark-Werte (null = ausgeblendet, zählt nicht)
  const allValues = [...own, ...(benchRows ?? [])].flatMap((r) => [r.female, r.male]);
  const anySuppressed = suppressedCellCount(own) + suppressedCellCount(benchRows) > 0;
  const genderNote = excludedGenderNote(overview.excludedGenderShare, overview.excludedGenderSuppressed);
  const max = niceMax(allValues);
  const scale = pyramidScale(max, BAR_AREA);
  const ticks = axisTicks(max);
  const yAxis = HEAD_H + AGE_GROUPS_TOP_DOWN.length * ROW_H;

  return (
    <section className="card age-pyramid" aria-label="Age pyramid">
      <div className="age-pyramid__head">
        <h3 className="age-pyramid__title">Age structure by <em>gender</em></h3>
        <p className="age-pyramid__stats small">
          <span>{statsLine(ownLabel(overview.isDemo), overview.n, overview.stats)}</span>
          {bench && <span className="muted">{statsLine(`Benchmark ${bench.label}`, bench.n, bench.stats)}</span>}
        </p>
      </div>

      {overview.benchmarks.length > 0 && (
        <div className="age-pyramid__segments" role="radiogroup" aria-label="Select benchmark">
          {overview.benchmarks.map((b) => (
            <button
              key={b.key}
              type="button"
              role="radio"
              aria-checked={b.key === bench?.key}
              disabled={!b.pyramid}
              title={b.pyramid ? undefined : 'No distribution for this group'}
              className="age-pyramid__segment"
              onClick={() => setSelectedKey(b.key)}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      <svg
        className="age-pyramid__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label="Age pyramid: share in per cent by age group and gender"
      >
        {/* Schraffur für ausgeblendete Zellen (Kleinzellenschutz) */}
        <defs>
          <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line className="age-pyramid__hatch-line" x1="0" y1="0" x2="0" y2="6" />
          </pattern>
        </defs>

        {/* Spaltenköpfe */}
        <text className="age-pyramid__text age-pyramid__text--head" x={CENTER_L} y={18} textAnchor="end">Women</text>
        <text className="age-pyramid__text age-pyramid__text--head" x={CENTER_R} y={18} textAnchor="start">Men</text>

        {/* Gitternetz und x-Achse (gemeinsame Skala, beide Seiten) */}
        {ticks.map((t) => (
          <g key={t}>
            <line className="age-pyramid__grid" x1={CENTER_L - scale(t)} x2={CENTER_L - scale(t)} y1={HEAD_H} y2={yAxis} />
            <line className="age-pyramid__grid" x1={CENTER_R + scale(t)} x2={CENTER_R + scale(t)} y1={HEAD_H} y2={yAxis} />
            <text className="age-pyramid__text age-pyramid__text--muted" x={CENTER_L - scale(t)} y={yAxis + 20} textAnchor="middle">{t} %</text>
            <text className="age-pyramid__text age-pyramid__text--muted" x={CENTER_R + scale(t)} y={yAxis + 20} textAnchor="middle">{t} %</text>
          </g>
        ))}

        {/* Zeilen: Altersgruppen oben -> unten */}
        {AGE_GROUPS_TOP_DOWN.map((group, i) => {
          const y = HEAD_H + i * ROW_H;
          const barY = y + (ROW_H - BAR_H) / 2;
          const ownRow = rowOf(own, group);
          const benchRow = rowOf(benchRows, group);
          return (
            <g key={group} data-group={group}>
              <text className="age-pyramid__text age-pyramid__text--group" x={(CENTER_L + CENTER_R) / 2} y={y + ROW_H / 2 + 5} textAnchor="middle">{group}</text>
              {(['female', 'male'] as const).map((side) => {
                const value = ownRow ? ownRow[side] : 0; // null = ausgeblendet
                const ref = benchRow ? benchRow[side] : undefined; // undefined = kein Benchmark, null = dort ausgeblendet
                const hidden = value === null;
                const left = side === 'female';
                const name = left ? 'Women' : 'Men';
                const text = cellText(name, group, value, ref);
                // Ausgeblendete Zelle: feste, schmale Schraffur statt Balkenlänge
                const len = hidden ? HIDDEN_CELL_W : scale(value);
                const x = left ? CENTER_L - len : CENTER_R;
                const endX = left ? x - 6 : x + len + 6;
                const mx = ref == null ? 0 : left ? CENTER_L - scale(ref) : CENTER_R + scale(ref);
                return (
                  <g key={side}>
                    <rect
                      className={`age-pyramid__bar age-pyramid__bar--${side}${hidden ? ' age-pyramid__bar--hidden' : ''}`}
                      data-bar={side}
                      data-group={group}
                      data-hidden={hidden ? 'true' : undefined}
                      x={x}
                      y={barY}
                      width={len}
                      height={BAR_H}
                      rx={4}
                      // inline-Style, weil die CSS-Regel .age-pyramid__bar { fill } ein fill-Attribut überschreiben würde
                      style={hidden ? { fill: `url(#${hatchId})` } : undefined}
                      tabIndex={0}
                      aria-label={text}
                    >
                      <title>{text}</title>
                    </rect>
                    {/* Deckfläche: macht die Mittelachsen-Seite des Balkens eckig (Radius nur am Datenende) */}
                    {!hidden && len > 4 && (
                      <rect
                        className={`age-pyramid__bar-cover age-pyramid__bar--${side}`}
                        x={left ? CENTER_L - 4 : CENTER_R}
                        y={barY}
                        width={4}
                        height={BAR_H}
                        aria-hidden="true"
                      />
                    )}
                    {/* Benchmark-Marker bleiben sichtbar, ausser die Benchmark-Zelle ist selbst ausgeblendet */}
                    {ref != null && (
                      <line
                        className="age-pyramid__marker"
                        data-marker={side}
                        data-group={group}
                        x1={mx}
                        x2={mx}
                        y1={barY - 4}
                        y2={barY + BAR_H + 4}
                      />
                    )}
                    <text
                      className={hidden ? 'age-pyramid__text age-pyramid__text--muted' : 'age-pyramid__text'}
                      x={endX}
                      y={barY + BAR_H / 2 + 5}
                      textAnchor={left ? 'end' : 'start'}
                    >
                      {hidden ? '< 3' : value.toFixed(1)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      <div className="age-pyramid__legend" aria-hidden="true">
        <span className="age-pyramid__legend-item"><span className="age-pyramid__swatch age-pyramid__swatch--female" />Women</span>
        <span className="age-pyramid__legend-item"><span className="age-pyramid__swatch age-pyramid__swatch--male" />Men</span>
        <span className="age-pyramid__legend-item"><span className="age-pyramid__swatch age-pyramid__swatch--bench" />Benchmark</span>
      </div>

      {anySuppressed && <p className="muted small" data-testid="small-cell-note">{SMALL_CELL_NOTE}</p>}
      {genderNote && <p className="muted small">{genderNote}</p>}
    </section>
  );
}
