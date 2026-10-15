/**
 * Layout des Sankey-Diagramms "Employment status" – reine Rechnung, ohne React/DOM.
 *
 * Drei feste Spalten wie in der abgenommenen Referenz (d3-sankey):
 *   Respondents  ->  Employed / Not employed  ->  Detailstatus (Full-time, Part-time …)
 * Wir rechnen das Layout selbst (statt d3-sankey), weil die Struktur fest ist;
 * Masse wie in der Referenz: viewBox 680 x 380, Knotenbreite 12, Abstand 14,
 * rechts 170 Einheiten Platz für Labels.
 *
 * Kleinzellenschutz: Blätter mit null werden NICHT gezeichnet. Die Differenz
 * zwischen Ast-Total und Summe der sichtbaren Blätter erscheint als neutraler,
 * schraffierter Strom "Hidden (< 3 people each)", damit die Summen stimmen.
 */
import type { EmploymentFlow, FlowBranch } from '../../../domain/employment';

export const SANKEY = { W: 680, H: 380, nodeWidth: 12, nodePadding: 14, top: 8, left: 4, labelSpace: 170 } as const;
/** Kompakte Variante für Handy-Breite (schmalere viewBox -> Schrift bleibt lesbar). */
export const SANKEY_MOBILE = { ...SANKEY, W: 340, H: 360, nodeWidth: 10, nodePadding: 12, labelSpace: 132 } as const;
export type SankeySize = typeof SANKEY | typeof SANKEY_MOBILE;

/** Farb-Rolle eines Knotens -> CSS-Klasse (Farben kommen aus tokens.css). */
export type NodeTone =
  | 'respondents' | 'employed' | 'full-time' | 'part-time' | 'self-employed' | 'other-employment'
  | 'not-employed' | 'seeking' | 'not-seeking' | 'student' | 'retired' | 'other-situation' | 'hidden';

export interface SankeyNode {
  id: string;
  label: string;
  depth: 0 | 1 | 2;
  value: number; // % aller Befragten
  /** true = Ast-Total ausgeblendet; value ist nur die Summe der sichtbaren Blätter (Anzeige "≥") */
  lowerBound?: boolean;
  tone: NodeTone;
  x0: number; x1: number; y0: number; y1: number;
}

export interface SankeyLink {
  id: string;
  source: SankeyNode;
  target: SankeyNode;
  value: number; // % aller Befragten
  width: number; // Strombreite (viewBox-Einheiten)
  path: string; // SVG-Pfad eines gefüllten Bandes (ribbonPath)
  /** Hover-Text, z. B. "Employed → Full-time: 58.6 % of respondents · 80.9 % of employed" */
  text: string;
}

export interface SankeyModel {
  nodes: SankeyNode[];
  links: SankeyLink[];
  /** Namen der ausgeblendeten Blätter (für die Zeile unter dem Diagramm) */
  hiddenLeaves: string[];
}

const LEAF_TONE: Record<string, NodeTone> = {
  full_time: 'full-time', part_time: 'part-time', self_employed: 'self-employed', other_employment: 'other-employment',
  seeking_work: 'seeking', not_seeking_work: 'not-seeking', student: 'student', retired: 'retired', other_situation: 'other-situation',
};

/** Label des neutralen Rest-Stroms für ausgeblendete Blätter. */
export const HIDDEN_LABEL = 'Hidden (< 3 people each)';

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Prozent mit 1 Dezimale, z. B. "58.6". */
export const pct = (v: number) => v.toFixed(1);

/**
 * Sichtbare Blätter eines Astes + ggf. Rest-Knoten für ausgeblendete Blätter.
 * Gibt [{key,label,value,tone}] in Anzeige-Reihenfolge zurück (nur Werte > 0).
 */
export function branchLeaves(branch: FlowBranch): { key: string; label: string; value: number; tone: NodeTone }[] {
  const visible = branch.leaves.filter((l) => l.value !== null && l.value > 0);
  const out = visible.map((l) => ({ key: l.key, label: l.label, value: l.value as number, tone: LEAF_TONE[l.key] ?? 'other-situation' }));
  // Rest nur, wenn wirklich etwas ausgeblendet ist (sonst sind Differenzen nur Rundung)
  const anyHidden = branch.leaves.some((l) => l.value === null);
  if (anyHidden && branch.total !== null) {
    const rest = Math.round((branch.total - out.reduce((s, l) => s + l.value, 0)) * 10) / 10;
    if (rest > 0) out.push({ key: `${branch.key}_hidden`, label: HIDDEN_LABEL, value: rest, tone: 'hidden' });
  }
  return out;
}

/**
 * Sankey-Strom als GEFÜLLTES Band (obere und untere Bezier-Kante).
 * Robuster als eine dicke Linie (d3.sankeyLinkHorizontal), deren Strichstärke bei
 * steilen Kurven (z. B. auf schmalen Bildschirmen) schräg über den Knoten hinausragt.
 * @param x0 Startkante (rechte Seite der Quelle)  @param y0 obere Kante am Start
 * @param x1 Zielkante (linke Seite des Ziels)     @param y1 obere Kante am Ziel
 * @param w  Bandbreite (vertikal)
 */
export function ribbonPath(x0: number, y0: number, x1: number, y1: number, w: number): string {
  // auf 2 Dezimalen runden: kompakte, gut lesbare Pfade ohne Fliesskomma-Rauschen
  const r = (v: number) => Math.round(v * 100) / 100;
  [x0, y0, x1, y1, w] = [x0, y0, x1, y1, w].map(r);
  const xm = r((x0 + x1) / 2);
  const yb0 = r(y0 + w), yb1 = r(y1 + w);
  return `M${x0},${y0}C${xm},${y0} ${xm},${y1} ${x1},${y1}L${x1},${yb1}C${xm},${yb1} ${xm},${yb0} ${x0},${yb0}Z`;
}

/** Mindest-Bandbreite, damit sehr kleine Anteile sichtbar bleiben (wie in der Referenz 1.5). */
export const MIN_RIBBON = 1.5;

/**
 * Baut das komplette Sankey-Modell für einen Erwerbsstatus.
 * Liefert null, wenn die Hauptäste unbekannt sind (beide Totals ausgeblendet).
 */
export function buildSankey(flow: EmploymentFlow, size: SankeySize = SANKEY): SankeyModel | null {
  const { W, H, nodeWidth, nodePadding, top, left, labelSpace } = size;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  // Schritt 1: Äste bestimmen. Ist ein Ast-Total ausgeblendet (Sekundärunterdrückung),
  // zeigt der Ast nur die Summe seiner SICHTBAREN Blätter (Untergrenze, "≥").
  const prepared = flow.branches.map((b) => {
    const leaves = branchLeaves(b);
    const lowerBound = b.total === null;
    const value = lowerBound ? round1(sum(leaves.map((l) => l.value))) : (b.total as number);
    return { b, leaves, lowerBound, value };
  }).filter((p) => p.value > 0);
  if (prepared.length === 0) return null;
  const hiddenLeaves = flow.branches.flatMap((b) => b.leaves.filter((l) => l.value === null).map((l) => l.label));

  // Rest auf 100 % bei ausgeblendeten Totals: eigener neutraler Ast direkt ab "Respondents"
  // (= Summe aller ausgeblendeten Zellen; aus den sichtbaren Werten ohnehin ablesbar)
  const anyLowerBound = prepared.some((p) => p.lowerBound);
  const rest = anyLowerBound ? round1(100 - sum(prepared.map((p) => p.value))) : 0;

  const leavesByBranch = prepared.map((p) => p.leaves);
  const allLeaves = leavesByBranch.flat();
  const middleCount = prepared.length + (rest > 0 ? 1 : 0);
  const middleSum = sum(prepared.map((p) => p.value)) + Math.max(rest, 0);

  // Schritt 2: vertikale Skala – die Spalte mit dem grössten Platzbedarf bestimmt sie
  const avail = H - 2 * top;
  const kyLeaves = allLeaves.length ? (avail - nodePadding * (allLeaves.length - 1)) / Math.max(sum(allLeaves.map((l) => l.value)), 1e-9) : Infinity;
  const kyBranches = (avail - nodePadding * (middleCount - 1)) / Math.max(middleSum, 1e-9);
  const ky = Math.min(kyLeaves, kyBranches);

  // Schritt 3: x-Positionen der drei Spalten
  const xRight = W - labelSpace - nodeWidth;
  const xMid = (left + xRight) / 2;

  // Schritt 4: Blätter von oben nach unten stapeln
  const nodes: SankeyNode[] = [];
  let y = top;
  const leafNodes = leavesByBranch.map((leaves) =>
    leaves.map((l) => {
      const node: SankeyNode = { id: l.key, label: l.label, depth: 2, value: l.value, tone: l.tone, x0: xRight, x1: xRight + nodeWidth, y0: y, y1: y + l.value * ky };
      y = node.y1 + nodePadding;
      return node;
    }),
  );

  // Schritt 5: Äste mittig vor ihren Blättern, Wurzel mittig vor den Ästen
  const branchNodes: SankeyNode[] = prepared.map((p, i) => {
    const kids = leafNodes[i];
    const h = p.value * ky;
    const center = kids.length ? (kids[0].y0 + kids[kids.length - 1].y1) / 2 : top + avail / 2;
    return {
      id: p.b.key, label: p.b.label, depth: 1 as const, value: p.value, lowerBound: p.lowerBound,
      tone: (p.b.key === 'employed' ? 'employed' : 'not-employed') as NodeTone,
      x0: xMid, x1: xMid + nodeWidth, y0: center - h / 2, y1: center + h / 2,
    };
  });
  if (rest > 0) {
    // neutraler Rest-Ast unter den anderen Ästen (ohne Blätter)
    const last = branchNodes[branchNodes.length - 1];
    branchNodes.push({
      id: 'hidden_rest', label: HIDDEN_LABEL, depth: 1, value: rest, tone: 'hidden',
      x0: xMid, x1: xMid + nodeWidth, y0: last.y1 + nodePadding, y1: last.y1 + nodePadding + rest * ky,
    });
  }
  // Überlappung der Äste vermeiden (bei sehr ungleichen Blöcken): nächsten Ast nach unten schieben
  for (let i = 1; i < branchNodes.length; i++) {
    const minY = branchNodes[i - 1].y1 + nodePadding;
    if (branchNodes[i].y0 < minY) {
      const d = minY - branchNodes[i].y0;
      branchNodes[i].y0 += d; branchNodes[i].y1 += d;
    }
  }
  // Alles muss in die viewBox passen: falls der letzte Ast unten herausragt, Äste nach oben schieben
  const overflow = branchNodes[branchNodes.length - 1].y1 - (H - top);
  if (overflow > 0) for (const b of branchNodes) { b.y0 -= overflow; b.y1 -= overflow; }
  const rootValue = sum(branchNodes.map((b) => b.value));
  const rootCenter = (branchNodes[0].y0 + branchNodes[branchNodes.length - 1].y1) / 2;
  const root: SankeyNode = {
    id: 'respondents', label: 'Respondents', depth: 0, value: rootValue, tone: 'respondents',
    x0: left, x1: left + nodeWidth, y0: rootCenter - (rootValue * ky) / 2, y1: rootCenter + (rootValue * ky) / 2,
  };
  nodes.push(root, ...branchNodes, ...leafNodes.flat());

  // Schritt 6: Ströme – an der Quelle gestapelt, am Ziel über die volle Knotenhöhe
  const links: SankeyLink[] = [];
  const makeLink = (source: SankeyNode, target: SankeyNode, value: number, sy: number, ofLabel: string | null): SankeyLink => {
    const width = value * ky;
    const w = Math.max(MIN_RIBBON, width);
    const ofParent = ofLabel ? ` · ${pct((100 * value) / source.value)} % of ${ofLabel}` : '';
    return {
      id: `${source.id}>${target.id}`, source, target, value, width,
      path: ribbonPath(source.x1, sy, target.x0, target.y0, w),
      text: `${source.label} → ${target.label}: ${pct(value)} % of respondents${ofParent}`,
    };
  };
  let rootY = root.y0;
  branchNodes.forEach((b, i) => {
    const link = makeLink(root, b, b.value, rootY, null);
    if (b.lowerBound) link.text = `${root.label} → ${b.label}: at least ${pct(b.value)} % of respondents (total hidden to protect anonymity)`;
    links.push(link);
    rootY += b.value * ky;
    let by = b.y0;
    for (const leaf of leafNodes[i] ?? []) {
      // Anteil am Ast nur, wenn das Ast-Total bekannt ist
      links.push(makeLink(b, leaf, leaf.value, by, b.lowerBound ? null : b.label.toLowerCase()));
      by += leaf.value * ky;
    }
  });

  return { nodes, links, hiddenLeaves };
}
