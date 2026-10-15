/**
 * Reine Rechenhilfen für die Alterspyramide (Diagramm A).
 * Keine React-/DOM-Abhängigkeit, damit sie einzeln testbar sind.
 */

/** Kleinste Skalenobergrenze in Prozent (verhindert eine Skala von 0). */
const MIN_MAX = 5;

/**
 * Rundet das Maximum aller Werte auf eine "schöne" Zahl auf (Vielfaches von 5).
 * Beide Seiten (Frauen/Männer) und beide Datenreihen (eigene Hochschule,
 * Benchmark) teilen sich diese Obergrenze.
 *
 * Beispiele: [29.6, 33.3] -> 35; [40] -> 40; [] -> 5; [0, 0] -> 5.
 * Nicht endliche Werte (NaN, Infinity), negative Werte und ausgeblendete Zellen
 * (null/undefined, Kleinzellenschutz) werden ignoriert – nie als Zahl behandelt.
 *
 * @param values Anteile in Prozent (null = ausgeblendet)
 * @returns Skalenobergrenze in Prozent, mindestens 5
 */
export function niceMax(values: readonly (number | null | undefined)[]): number {
  // Schritt 1: nur sinnvolle Werte berücksichtigen
  const valid = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  if (valid.length === 0) return MIN_MAX;
  // Schritt 2: Maximum bestimmen und auf das nächste Vielfache von 5 aufrunden
  const max = Math.max(...valid);
  // Rundungsrauschen (z. B. 35.0000000001) darf die Skala nicht um 5 vergrössern
  return Math.max(MIN_MAX, Math.ceil(max / 5 - 1e-9) * 5);
}

/**
 * Achsenmarken von 0 bis zur Obergrenze: Schritt 5 bis max 20, darüber Schritt 10.
 * Die Obergrenze selbst ist nur dabei, wenn sie auf dem Raster liegt (z. B. 35 bei
 * Schritt 10 nicht – dann endet die Achse bei 30, die Skala läuft aber bis 35).
 *
 * @param max Skalenobergrenze (aus niceMax)
 */
export function axisTicks(max: number): number[] {
  const step = max > 20 ? 10 : 5;
  const ticks: number[] = [];
  for (let t = 0; t <= max + 1e-9; t += step) ticks.push(t);
  return ticks;
}

/** Skalierungsfunktion Prozent -> Pixel (Länge ab der Mittelachse). */
export type PyramidScale = (valuePct: number) => number;

/**
 * Baut die gemeinsame lineare Skala für beide Pyramidenhälften.
 * 0 % -> 0 px, `max` % -> `halfWidth` px. Werte werden auf [0, max] begrenzt,
 * damit Balken nie über den Rand hinausragen.
 *
 * @param max Skalenobergrenze in Prozent (> 0)
 * @param halfWidth verfügbare Balkenlänge einer Seite in Pixel
 */
export function pyramidScale(max: number, halfWidth: number): PyramidScale {
  return (valuePct: number) => {
    if (!Number.isFinite(valuePct) || max <= 0) return 0;
    const clamped = Math.min(Math.max(valuePct, 0), max);
    return (clamped / max) * halfWidth;
  };
}

/** Breite (viewBox-Einheiten) des Platzhalters für eine ausgeblendete Zelle. */
export const HIDDEN_CELL_W = 30;

/**
 * Tooltip-/aria-Text einer Pyramiden-Zelle.
 * Beispiele: "Women 25-34: 29.6 % (Benchmark 21.2 %)",
 *            "Women 35-44: fewer than 3 people – hidden to protect anonymity (Benchmark 13.6 %)".
 * @param ref Benchmark-Wert: undefined = kein Benchmark, null = im Benchmark ausgeblendet
 */
export function cellText(name: string, group: string, value: number | null, ref: number | null | undefined): string {
  const own = value === null ? 'fewer than 3 people – hidden to protect anonymity' : `${value.toFixed(1)} %`;
  const bench = ref === undefined ? '' : ref === null ? ' (Benchmark hidden)' : ` (Benchmark ${ref.toFixed(1)} %)`;
  return `${name} ${group}: ${own}${bench}`;
}

/**
 * Fußnote zu "divers" / "keine Angabe" (nicht in der Pyramiden-Basis).
 * share = Summe der sichtbaren Teile (oder null), suppressed = ein Teil ist ausgeblendet.
 * Gibt null zurück, wenn es nichts zu sagen gibt.
 */
export function excludedGenderNote(share: number | null, suppressed: boolean): string | null {
  const lead = 'Respondents who identify as non-binary or preferred not to say';
  const tail = 'are not included in the pyramid.';
  if (share === null && !suppressed) return null;
  // Sichtbarer Anteil 0 + ausgeblendeter Teil: "0.0 % plus …" wäre irreführend
  if (share === null || (suppressed && share === 0)) return `${lead} (fewer than 3 people) ${tail}`;
  if (suppressed) return `${lead} (${share.toFixed(1)} % plus a group of fewer than 3 people) ${tail}`;
  return `${lead} (${share.toFixed(1)} %) ${tail}`;
}

/** Fußnote zum Kleinzellenschutz (erscheint, sobald eine Zelle ausgeblendet ist). */
export const SMALL_CELL_NOTE =
  'Cells with fewer than 3 people are hidden; some further cells are hidden so they cannot be derived from totals.';
