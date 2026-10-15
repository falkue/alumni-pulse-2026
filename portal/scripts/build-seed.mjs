/**
 * Erzeugt die Seed-Dateien des Demo-Portals aus der Referenz-CSV:
 *   seed/schools.json  (50 Hochschulen, sortiert nach schoolId, + Demo-Eintrag "ALL" am Ende)
 *   seed/users.json    (1 Admin + je Hochschule 1 Account + 2 Zweit-Accounts + Demo-Account u-ALL)
 * Aufruf: npm run seed  (läuft automatisch vor dev/build/test)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsvObjects } from './csv.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = resolve(root, '../data/reference/schools.csv');
const seedDir = resolve(root, 'seed');

const FIXED_TS = '2026-10-01T08:00:00.000Z';
const DISABLED = ['S007', 'S014', 'S021', 'S028', 'S035'];
const INVITED = ['S010', 'S020', 'S030'];

/**
 * Wandelt eine CSV-Zeile in ein School-Objekt (camelCase).
 * Simulationsparameter (quality_effect, network_effect, ai_curriculum_effect, share_*) entfallen.
 * @param {Record<string,string>} r
 */
export function mapSchool(r) {
  return {
    schoolId: r.school_id,
    name: r.school_name,
    shortName: r.school_short,
    country: r.country,
    iso2: r.iso2,
    region: r.region,
    subregion: r.subregion,
    city: r.city,
    institutionType: r.institution_type,
    aacsb: r.aacsb === '1',
    equis: r.equis === '1',
    bgsChapter: r.bgs_chapter === '1',
    foundedYear: Number(r.founded_year),
    alumniBaseSize: Number(r.alumni_base_size),
    rankingTier: Number(r.ranking_tier),
    currency: r.currency,
    nRespondents: Number(r.n_respondents),
    notes: r.notes,
  };
}

/** Mandanten-ID der gepoolten Demo-Sicht "alle Hochschulen" (Pipeline: aggregates/schools/ALL.json). */
export const DEMO_ALL_ID = 'ALL';

/**
 * Pseudo-Hochschule für die Demo-Sicht "All participating schools (demo)".
 * Keine echte Hochschule: isDemo = true, Stammdaten wie Land/Tier/AACSB leer.
 * nRespondents = Summe aller Hochschulen (gepoolt).
 * @param {{nRespondents:number}[]} schools
 */
export function buildDemoSchool(schools) {
  return {
    schoolId: DEMO_ALL_ID,
    name: 'All participating schools (demo)',
    shortName: 'ALL',
    country: '',
    iso2: '',
    region: 'All regions',
    subregion: '',
    city: '',
    institutionType: 'all',
    aacsb: false,
    equis: false,
    bgsChapter: false,
    foundedYear: 0,
    alumniBaseSize: 0,
    rankingTier: 0,
    currency: '',
    nRespondents: schools.reduce((sum, s) => sum + s.nRespondents, 0),
    notes: 'Demo view: all participating schools pooled. Not a real institution.',
    isDemo: true,
  };
}

/**
 * Baut die deterministische Account-Liste aus den Hochschulen.
 * @param {{schoolId:string, shortName:string}[]} schools
 */
export function buildUsers(schools) {
  const base = { createdAt: FIXED_TS, updatedAt: FIXED_TS, updatedBy: null };
  const users = [
    {
      uid: 'admin-demo',
      email: 'admin@demo.alumnipulse.example',
      displayName: 'Study admin (demo)',
      role: 'admin',
      schoolId: null,
      status: 'active',
      ...base,
    },
  ];
  for (const s of schools) {
    users.push({
      uid: `u-${s.schoolId}`,
      email: `${s.schoolId.toLowerCase()}@demo.alumnipulse.example`,
      displayName: `Contact ${s.shortName}`,
      role: 'school',
      schoolId: s.schoolId,
      status: DISABLED.includes(s.schoolId) ? 'disabled' : INVITED.includes(s.schoolId) ? 'invited' : 'active',
      ...base,
    });
  }
  // Zweite Accounts: S001 (eingeladen) -> Zugangsstatus "partial" (1 von 2 aktiv);
  // S002 (aktiv) -> zwei aktive Accounts, Zugangsstatus bleibt "active".
  for (const [id, status] of [['S001', 'invited'], ['S002', 'active']]) {
    const s = schools.find((x) => x.schoolId === id);
    if (!s) continue;
    users.push({
      uid: `u-${id}-b`,
      email: `${id.toLowerCase()}-b@demo.alumnipulse.example`,
      displayName: `Second contact ${s.shortName}`,
      role: 'school',
      schoolId: id,
      status,
      ...base,
    });
  }
  // Demo-Account für die gepoolte Sicht über alle Hochschulen
  users.push({
    uid: `u-${DEMO_ALL_ID}`,
    email: 'all-schools@demo.alumnipulse.example',
    displayName: 'Demo: all schools',
    role: 'school',
    schoolId: DEMO_ALL_ID,
    status: 'active',
    ...base,
  });
  return users;
}

function main() {
  if (!existsSync(csvPath)) {
    console.error(`Fehler: Referenz-CSV nicht gefunden: ${csvPath}\nBitte data/reference/schools.csv bereitstellen.`);
    process.exit(1);
  }
  const schools = parseCsvObjects(readFileSync(csvPath, 'utf8'))
    .map(mapSchool)
    .sort((a, b) => a.schoolId.localeCompare(b.schoolId));
  mkdirSync(seedDir, { recursive: true });
  // Demo-Eintrag "ALL" bewusst am Ende (nicht mitsortiert)
  const withDemo = [...schools, buildDemoSchool(schools)];
  const users = buildUsers(schools);
  writeFileSync(resolve(seedDir, 'schools.json'), JSON.stringify(withDemo, null, 2) + '\n');
  writeFileSync(resolve(seedDir, 'users.json'), JSON.stringify(users, null, 2) + '\n');
  console.log(`Seed geschrieben: ${schools.length} Hochschulen + Demo "ALL", ${users.length} Accounts.`);
}

// Nur ausführen, wenn direkt per node gestartet (nicht beim Import).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
