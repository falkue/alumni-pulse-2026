/**
 * Überschrift im Circle-Stil: Serif, genau EIN Akzentwort in <em> (blau).
 * Der Text bleibt unverändert (wichtig für Screenreader und Tests), nur das
 * erste Vorkommen von `accent` wird hervorgehoben.
 *
 *   <Headline as="h2" text="Who responded?" accent="responded" />
 */
import type { ReactNode } from 'react';

type Level = 'h1' | 'h2' | 'h3';

/** Zerlegt `text` in [vorher, Akzent, nachher]; ohne Treffer bleibt der Text unverändert. */
export function splitAccent(text: string, accent?: string): ReactNode[] {
  if (!accent) return [text];
  const i = text.indexOf(accent);
  if (i < 0) return [text];
  return [text.slice(0, i), <em key="accent">{accent}</em>, text.slice(i + accent.length)].filter((p) => p !== '');
}

/** Überschrift mit optionalem Akzentwort. */
export function Headline({ as: Tag = 'h1', text, accent, id }: { as?: Level; text: string; accent?: string; id?: string }) {
  return <Tag id={id}>{splitAccent(text, accent)}</Tag>;
}
