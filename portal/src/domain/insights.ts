/**
 * KI-Interpretationen von Diagrammen ("AI insights").
 *
 * Prototyp: Texte wurden mit Claude (Claude Code) aus den synthetischen Aggregaten
 * erzeugt. Später: automatisch im Firebase-Backend mit Gemini (gleicher Prompt,
 * insights/<chart>/PROMPT.md), gespeichert unter aggregates/{schoolId}/insights/{chartId}.
 *
 * Diese Datei enthält
 *  - den Typ eines Insight-Textes und sein Mapping aus JSON,
 *  - checkInsightNumbers(): Halluzinations-Schutz – jede Zahl im Text muss aus
 *    den Eingabedaten stammen. Läuft als Unit-Test und soll später im Backend
 *    VOR dem Veröffentlichen eines generierten Textes laufen.
 */

/** Ein generierter Interpretationstext für ein Diagramm einer Hochschule. */
export interface ChartInsight {
  schoolId: string;
  chartId: string;
  headline: string;
  howToRead: string;
  keyFindings: string[];
  benchmark: string;
  caveats: string | null;
  generatedBy: { provider: string; model: string; mode: string };
  generatedAt: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Roh-JSON (snake_case, wie in PROMPT.md) -> ChartInsight. Fehlende Felder werden leer. */
export function mapChartInsight(raw: unknown): ChartInsight {
  const o = (raw ?? {}) as Record<string, any>;
  return {
    schoolId: str(o.school_id),
    chartId: str(o.chart_id),
    headline: str(o.headline),
    howToRead: str(o.how_to_read),
    keyFindings: Array.isArray(o.key_findings) ? o.key_findings.filter((x: unknown) => typeof x === 'string') : [],
    benchmark: str(o.benchmark),
    caveats: typeof o.caveats === 'string' && o.caveats.trim() ? o.caveats : null,
    generatedBy: {
      provider: str(o.generated_by?.provider),
      model: str(o.generated_by?.model),
      mode: str(o.generated_by?.mode),
    },
    generatedAt: str(o.generated_at),
  };
}

/** Gesamter Fliesstext eines Insights (für Prüfungen). */
export function insightText(i: ChartInsight): string {
  return [i.headline, i.howToRead, ...i.keyFindings, i.benchmark, i.caveats ?? ''].join(' ');
}

/** Alle Zahlenwerte aus beliebig verschachtelten Eingaben einsammeln (null wird ignoriert). */
export function collectNumbers(input: unknown, out: number[] = []): number[] {
  if (typeof input === 'number' && Number.isFinite(input)) out.push(input);
  else if (Array.isArray(input)) input.forEach((v) => collectNumbers(v, out));
  else if (input && typeof input === 'object') Object.values(input).forEach((v) => collectNumbers(v, out));
  return out;
}

export interface NumberCheck {
  ok: boolean;
  /** Zahlen im Text, die nicht aus den Eingaben ableitbar sind */
  unknown: string[];
}

/**
 * Prüft die Zahlen eines Textes gegen die Eingabedaten (Regeln aus PROMPT.md):
 *  - "72.4 %"  muss als Wert in den Eingaben vorkommen (1 Dezimale),
 *  - "20.2 pp" muss die Differenz zweier Eingabewerte sein (gerundet, 1 Dezimale),
 *  - "n = 29"  muss als Wert vorkommen.
 * Andere Zahlen (z. B. "fewer than 3 people", Jahreszahlen) werden nicht geprüft.
 */
export function checkInsightNumbers(text: string, inputs: unknown): NumberCheck {
  const values = collectNumbers(inputs);
  const fmt = (v: number) => v.toFixed(1);
  const valueSet = new Set(values.map(fmt));
  const diffSet = new Set<string>();
  for (const a of values) for (const b of values) diffSet.add(fmt(Math.round(Math.abs(a - b) * 10) / 10));
  const nSet = new Set(values.map((v) => String(v)));

  const unknown: string[] = [];
  // Prozentwerte (Leerzeichen vor % optional, auch schmales Leerzeichen)
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s?%/g)) {
    if (!valueSet.has(fmt(Number(m[1])))) unknown.push(m[0]);
  }
  // Prozentpunkte
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s?(?:pp|percentage points?)\b/g)) {
    if (!diffSet.has(fmt(Number(m[1])))) unknown.push(m[0]);
  }
  // Fallzahlen
  for (const m of text.matchAll(/n\s?=\s?(\d[\d,]*)/g)) {
    if (!nSet.has(m[1].replace(/,/g, ''))) unknown.push(m[0]);
  }
  return { ok: unknown.length === 0, unknown };
}
