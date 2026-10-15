/**
 * Erzeugt die EINGABEN für KI-Interpretationen des Sankey "Employment status".
 *
 * Für jede Hochschule (und die Demo-Sicht ALL) eine kompakte Faktendatei:
 *   insights/career_employment/inputs/<id>.json
 * Inhalt: nur AGGREGIERTE Anteile (eigene Werte, eigene Region, alle Hochschulen),
 * ausgeblendete Zellen als null. Keine Einzelantworten.
 *
 * Diese Dateien sind die einzige Grundlage für die Texte (Prototyp: Claude,
 * später im Firebase-Backend: Gemini) – und für den Test, der prüft, dass jede
 * Zahl im Text aus diesen Fakten stammt.
 *
 * Aufruf: node scripts/build-insight-inputs.mjs   (liest ../data/processed/aggregates/schools)
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = resolve(root, '../data/processed/aggregates/schools');
const outDir = resolve(root, 'insights/career_employment/inputs');
const METRIC = 'career.employment.flow';

/** Roh-Flow -> flache, gut lesbare Fakten (Prozent aller Befragten; null = < 3 Personen). */
export function flatFlow(flow) {
  if (!flow) return null;
  const e = flow.employed ?? {};
  const n = flow.not_employed ?? {};
  return {
    n: flow.n ?? null,
    employed_total: e.total ?? null,
    full_time: e.full_time ?? null,
    part_time: e.part_time ?? null,
    self_employed: e.self_employed ?? null,
    other_employment: e.other_employment ?? null,
    not_employed_total: n.total ?? null,
    seeking_work: n.seeking_work ?? null,
    not_seeking_work: n.not_seeking_work ?? null,
    student: n.student ?? null,
    retired: n.retired ?? null,
    other_situation: n.other_situation ?? null,
  };
}

/** Aus einem Schul-Dokument die Insight-Eingaben bauen. */
export function buildInputs(doc) {
  const isDemo = doc.demo === true;
  const region = isDemo ? null : doc.school?.region ?? null;
  const bench = doc.benchmarks ?? {};
  const inputs = {
    school_id: doc.school?.school_id,
    school_name: doc.school?.school_name,
    is_demo_all_schools: isDemo,
    published: doc.published === true,
    metric: METRIC,
    unit: 'percent of all respondents; null = hidden (fewer than 3 people)',
    own: doc.published === true ? flatFlow(doc.metrics?.[METRIC]) : null,
    benchmarks: {},
  };
  // Hochschule: eigene Region + alle; Demo ALL: alle Regionen
  const keys = isDemo ? Object.keys(bench).filter((k) => k.startsWith('region=')) : ['all', `region=${region}`];
  if (!isDemo) inputs.benchmarks.all = flatFlow(bench.all?.metrics?.[METRIC]);
  for (const k of keys) if (k !== 'all' && bench[k]) inputs.benchmarks[k] = flatFlow(bench[k].metrics?.[METRIC]);
  return inputs;
}

function main() {
  if (!existsSync(srcDir)) {
    console.error(`Fehler: ${srcDir} fehlt – zuerst die Pipeline (synthetisch) laufen lassen.`);
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  const files = readdirSync(srcDir).filter((f) => /^(S\d{3}|ALL)\.json$/.test(f));
  for (const f of files) {
    const doc = JSON.parse(readFileSync(resolve(srcDir, f), 'utf8'));
    writeFileSync(resolve(outDir, f), JSON.stringify(buildInputs(doc), null, 2) + '\n');
  }
  console.log(`Insight-Eingaben geschrieben: ${files.length} Dateien -> ${outDir}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
