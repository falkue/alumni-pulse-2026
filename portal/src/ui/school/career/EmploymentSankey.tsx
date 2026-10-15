/**
 * Sankey-Diagramm "Employment status" (Karriere, Frage 1) im Bereich "Career & salary".
 *
 * Optik nach der abgenommenen Referenz (docs/mockups/career_q1_sankey_reference.html),
 * Farben über die Circle-Tokens. Werte sind Prozent aller Befragten.
 *
 * Ablauf:
 *  1. Auswahl im Segment-Control: "Your school" / eigene Region / "All schools"
 *     (Demo-Sicht ALL: "All schools" + Regionen)
 *  2. Layout rechnen (sankeyLayout.ts) – Desktop- oder Handy-Variante
 *  3. Ströme, Knoten, Labels zeichnen; Hover/Fokus zeigt Details in der Statuszeile
 *  4. Ausgeblendete Blätter (< 3 Personen) unter dem Diagramm auflisten
 */
import { useId, useMemo, useState } from 'react';
import { employedShare, flowOptions, type EmploymentOverview } from '../../../domain/employment';
import { useIsMobile } from '../../useIsMobile';
import { buildSankey, pct, SANKEY, SANKEY_MOBILE } from './sankeyLayout';
import './EmploymentSankey.css';

const HINT = 'Hover a flow for details.';

/** Zahl im en-GB-Format (Tausendertrenner). */
const fmtN = (v: number) => new Intl.NumberFormat('en-GB').format(v);

/** Karte mit Segment-Control, Sankey und Hinweisen. */
export function EmploymentSankey({ overview }: { overview: EmploymentOverview }) {
  const options = useMemo(() => flowOptions(overview), [overview]);
  const [key, setKey] = useState(options[0]?.key);
  const [status, setStatus] = useState(HINT);
  const mobile = useIsMobile();
  const hatchId = `emp-hatch-${useId().replace(/:/g, '')}`;

  const selected = options.find((o) => o.key === key) ?? options[0];
  const size = mobile ? SANKEY_MOBILE : SANKEY;
  const model = useMemo(() => (selected ? buildSankey(selected.flow, size) : null), [selected, size]);

  const title = (
    <h3>
      Employment <em>status</em>
    </h3>
  );

  // Keine Daten (z. B. Mindestfallzahl nicht erreicht und keine Benchmarks)
  if (!selected) {
    return (
      <section className="card emp-sankey" aria-label="Employment status">
        {title}
        <p className="muted">Fewer than 10 responses – not shown.</p>
      </section>
    );
  }

  const share = employedShare(selected.flow);
  const head = [
    selected.flow.n !== null ? `n = ${fmtN(selected.flow.n)}` : null,
    share !== null ? `${pct(share)} % employed` : 'employment totals hidden to protect anonymity',
  ].filter(Boolean).join(' · ');

  return (
    <section className="card emp-sankey" aria-label="Employment status">
      {title}
      <p className="muted small">Share of all respondents by employment situation (career question 1).</p>

      <div className="emp-sankey__head">
        {options.length > 1 && (
          <div className="emp-sankey__seg" role="radiogroup" aria-label="Compare with">
            {options.map((o) => (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={o.key === selected.key}
                className="emp-sankey__seg-btn"
                onClick={() => {
                  setKey(o.key);
                  setStatus(HINT);
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
        <span className="emp-sankey__meta" data-testid="sankey-meta">{head}</span>
      </div>

      {model ? (
        <svg
          className="emp-sankey__svg"
          viewBox={`0 0 ${size.W} ${size.H}`}
          role="group"
          aria-label={`Employment status flows for ${selected.label}`}
        >
          {/* Schraffur für den Rest-Strom ausgeblendeter Blätter */}
          <defs>
            <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line className="emp-sankey__hatch-line" x1="0" y1="0" x2="0" y2="6" />
            </pattern>
          </defs>

          {/* Ströme als gefüllte Bänder (Farbe des Ziels); Hover/Fokus -> Statuszeile */}
          <g>
            {model.links.map((l) => (
              <path
                key={l.id}
                data-link={l.id}
                className={`emp-sankey__link tone-${l.target.tone}`}
                d={l.path}
                style={l.target.tone === 'hidden' ? { fill: `url(#${hatchId})`, fillOpacity: 1 } : undefined}
                tabIndex={0}
                aria-label={l.text}
                onMouseEnter={() => setStatus(l.text)}
                onFocus={() => setStatus(l.text)}
                onMouseLeave={() => setStatus(HINT)}
                onBlur={() => setStatus(HINT)}
              >
                <title>{l.text}</title>
              </path>
            ))}
          </g>

          {/* Knoten */}
          <g>
            {model.nodes.map((n) => (
              <rect
                key={n.id}
                data-node={n.id}
                className={`emp-sankey__node tone-${n.tone}`}
                x={n.x0}
                y={n.y0}
                width={n.x1 - n.x0}
                height={Math.max(1, n.y1 - n.y0)}
                rx={3}
                style={n.tone === 'hidden' ? { fill: `url(#${hatchId})` } : undefined}
              />
            ))}
          </g>

          {/* Labels: Blätter einzeilig "Full-time  58.6 %", Wurzel/Äste zweizeilig */}
          <g>
            {model.nodes.map((n) => {
              const x = n.depth === 2 ? n.x1 + 8 : n.x1 + 6;
              const y = (n.y0 + n.y1) / 2;
              return n.depth === 2 ? (
                <text key={n.id} className="emp-sankey__label" x={x} y={y} dy="0.35em">
                  {n.label}  {pct(n.value)} %
                </text>
              ) : (
                <g key={n.id}>
                  <text className="emp-sankey__label emp-sankey__label--strong" x={x} y={y} dy="-0.2em">{n.label}</text>
                  <text className="emp-sankey__label emp-sankey__label--sub" x={x} y={y} dy="1.1em">{n.lowerBound ? '≥ ' : ''}{pct(n.value)} %</text>
                </g>
              );
            })}
          </g>
        </svg>
      ) : (
        <p className="muted">Employment status is hidden to protect anonymity.</p>
      )}

      <div className="emp-sankey__status" aria-live="polite">{status}</div>
      {model && model.hiddenLeaves.length > 0 && (
        <p className="emp-sankey__hidden" data-testid="sankey-hidden">
          Hidden to protect anonymity (&lt; 3 people): {model.hiddenLeaves.join(', ')}
        </p>
      )}
    </section>
  );
}
