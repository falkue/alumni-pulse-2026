# Firebase-Migration – Schritt für Schritt

> **Status: Entwurf** (Stand 2026-10-15). Noch nichts davon ist umgesetzt oder deployt.
> Datenmodell: [`DATA_MODEL.md`](DATA_MODEL.md). Entwürfe: `firebase/`, `src/services/firebase/`.

Ziel: Das lokale Demo-Portal (localStorage-Adapter) läuft unverändert weiter; per
Umgebungsvariable wird auf Firebase (Auth + Firestore + Storage + Hosting) umgeschaltet. Die UI
bleibt unverändert, weil sie nur die Ports aus `src/services/ports.ts` kennt.

## Übersicht

| # | Schritt | Ergebnis |
|---|---|---|
| 0 | Entscheidungen klären | Region, Login-Verfahren, Schwellen, Datenschutz |
| 1 | Firebase-Projekte anlegen | `staging` + `prod` in `europe-west6` |
| 2 | Pakete installieren | `firebase` (App), `firebase-tools`, Test-Pakete (dev) |
| 3 | Konfiguration übernehmen | `firebase.json`, `.firebaserc`, `.env` |
| 4 | Adapter aktivieren | `VITE_BACKEND=firebase` schaltet in `src/services/index.ts` um |
| 5 | Cloud Functions | `onUserWrite`, `inviteAccount` (optional `setAccountStatus`) |
| 6 | Seed-Import | `schools` + `users` per Admin SDK |
| 7 | Aggregate-Import | `firestore_export/` → `aggregates`, `benchmarks`, `reports` |
| 8 | Rules testen | Emulator + `@firebase/rules-unit-testing` |
| 9 | Deployment | Rules → Indizes → Functions → Hosting |
| 10 | Datenschutz | DSG/DSGVO-Checkliste |

## 0. Entscheidungen vorab

- **Region:** `europe-west6` (Zürich) für Firestore, Storage und Functions. Die
  Firestore-Region ist nach dem Anlegen **nicht mehr änderbar**.
- **Login:** E-Mail-Link (passwortlos) für Hochschul-Kontakte; SSO (SWITCH edu-ID / SAML) für
  das ZHAW-Team. SAML/OIDC erfordert das Upgrade auf **Identity Platform**.
- **Mindestfallzahlen** (Vorschlag in `DATA_MODEL.md` Abschnitt 10) mit Projektleitung und
  Datenschutz abstimmen.
- **Plan:** Blaze (Pay-as-you-go) – nötig für Cloud Functions und Storage-Buckets.

## 1. Projekte anlegen (manuell in der Firebase-Konsole)

1. Zwei Projekte: `alumni-pulse-staging`, `alumni-pulse-prod` (Namen sind Platzhalter).
2. Firestore (Native Mode, Edition Standard) mit Standort **`europe-west6`** anlegen.
3. Storage-Bucket mit Standort **`europe-west6`** anlegen.
4. Authentication aktivieren: Anbieter „E-Mail-Link“; Autorisierte Domains = Hosting-Domain.
   Für SSO: Identity Platform aktivieren, OIDC-/SAML-Provider anlegen (Provider-ID notieren).
5. Web-App registrieren → Konfigurationswerte für `.env` notieren.
6. Budget-Alarm setzen; App Check (reCAPTCHA Enterprise) für Firestore/Storage einplanen.

## 2. Pakete installieren

```bash
cd portal
npm i firebase
npm i -D firebase-tools @firebase/rules-unit-testing
# später im Unterordner functions/:  npm i firebase-functions firebase-admin
```

## 3. Konfiguration übernehmen

```bash
cp firebase/firebase.json ./firebase.json        # Pfade sind relativ zu portal/ geschrieben
cp firebase/.firebaserc.example ./.firebaserc     # Projekt-IDs eintragen
```

`.env.local` (nicht einchecken; `.env.example` mit leeren Werten einchecken):

```dotenv
VITE_BACKEND=firebase
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=alumni-pulse-staging.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=alumni-pulse-staging
VITE_FIREBASE_STORAGE_BUCKET=alumni-pulse-staging.firebasestorage.app
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_SSO_PROVIDER_ID=oidc.switch-eduid
VITE_FIREBASE_USE_EMULATORS=false
```

Für lokale Entwicklung gegen Emulatoren: `VITE_FIREBASE_PROJECT_ID=demo-alumni-pulse`,
`VITE_FIREBASE_USE_EMULATORS=true` (die übrigen Werte dürfen Dummy-Werte sein).

Typen für `import.meta.env` in `src/vite-env.d.ts` ergänzen (`VITE_BACKEND`, `VITE_FIREBASE_*`).

## 4. Adapter aktivieren

1. `src/services/firebase/firebaseAdapter.skeleton.ts.txt` → `firebaseAdapter.ts` umbenennen,
   gegen die aktuellen Ports prüfen, Typfehler beheben.
2. `src/services/index.ts` (Austauschstelle, von der Datenschicht-Session gepflegt):

```ts
import { createFirebaseServices } from './firebase/firebaseAdapter';

const useFirebase = import.meta.env.VITE_BACKEND === 'firebase';
const services = useFirebase
  ? createFirebaseServices()
  : createLocalServices({ seedSchools: schoolsSeed as School[], seedUsers: usersSeed as UserAccount[] });

export const auth = services.auth;
export const data = services.data;
export const IS_DEMO_BACKEND = !useFirebase;
```

3. Login-Screen: Bei `IS_DEMO_BACKEND === false` statt Demo-Auswahl ein E-Mail-Feld
   (`sendLoginLink`) und SSO-Button anzeigen; Route `/login/complete` ruft `signIn()` auf.
   **Port-Erweiterung nötig** (siehe `src/services/firebase/README.md`, offene Punkte).
4. Damit die Seed-JSONs nicht ins Produktions-Bundle geraten: im Firebase-Zweig dynamisch
   importieren (`await import('../../seed/users.json')` nur im lokalen Zweig).

## 5. Cloud Functions

Ordner `portal/functions/` (TypeScript) anlegen, Code-Skizze in `DATA_MODEL.md` Abschnitt 4:

- `onUserWrite` (Firestore-Trigger `users/{uid}`): Claims `{role, schoolId}` setzen,
  Auth-`disabled` bei `status == 'disabled'`, `revokeRefreshTokens` beim Sperren und bei
  Rollen-/Mandantenwechsel.
- `inviteAccount` (Callable): Admin prüfen, `validateInvite`-Regeln, Auth-User + `users`-Dokument
  (`status: 'invited'`) anlegen, Login-Link erzeugen und über einen Mail-Dienst versenden.
- optional `setAccountStatus` (Callable) statt Client-Batch, falls Audit revisionssicher sein muss.

`firebase.json` ergänzen: `"functions": { "source": "functions", "runtime": "nodejs22" }` und
Emulator `"functions": { "port": 5001 }`.

## 6. Seed-Import `schools` + `users` (Admin SDK)

Skript `portal/scripts/import-seed.mjs` (Skizze). Läuft lokal mit Service-Account-Schlüssel
(`GOOGLE_APPLICATION_CREDENTIALS`) oder gegen den Emulator (`FIRESTORE_EMULATOR_HOST`,
`FIREBASE_AUTH_EMULATOR_HOST` gesetzt).

```js
// SKIZZE – scripts/import-seed.mjs
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-alumni-pulse' });
const db = getFirestore();
const auth = getAuth();
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const ts = (iso) => Timestamp.fromDate(new Date(iso));

// 1) schools: 1:1 aus seed/schools.json (bereits aus der CSV gemappt, siehe build-seed.mjs)
const schools = read('../seed/schools.json');
for (let i = 0; i < schools.length; i += 500) {
  const batch = db.batch();
  for (const s of schools.slice(i, i + 500)) batch.set(db.doc(`schools/${s.schoolId}`), s);
  await batch.commit();
}

// 2) users: Auth-User mit fester uid + Dokument. Demo-Accounts (*.example) NUR in Emulator/Staging!
const users = read('../seed/users.json');
const isProd = process.env.TARGET === 'prod';
for (const u of users) {
  if (isProd && u.email.endsWith('.example')) continue;
  try {
    await auth.createUser({ uid: u.uid, email: u.email, displayName: u.displayName,
                            emailVerified: true, disabled: u.status === 'disabled' });
  } catch (e) { if (e.code !== 'auth/uid-already-exists') throw e; }
  await auth.setCustomUserClaims(u.uid, { role: u.role, schoolId: u.schoolId });
  const { uid, ...doc } = u;
  await db.doc(`users/${uid}`).set({ ...doc, createdAt: ts(u.createdAt), updatedAt: ts(u.updatedAt) });
}
```

In Produktion wird nur der erste Admin per Skript angelegt; alle Hochschul-Accounts entstehen
über `inviteAccount`.

## 7. Aggregate-Import aus `portal/firestore_export/`

Stand heute leer; Format-Vorschlag in `DATA_MODEL.md` Abschnitt 9 (an die Pipeline-Session
weitergeben). Skript `scripts/import-aggregates.mjs` (Skizze der Schritte):

1. `manifest.json` lesen; `pipeline_version`, `survey_wave`, `thresholds` übernehmen.
2. Für jede Datei `aggregates/{school_id}/{section_id}.json`:
   Pfad-ID = `school_id` im JSON = vorhandenes `schools`-Dokument; snake_case → camelCase;
   Schwellen erneut anwenden; verbotene Schlüssel abweisen; nach
   `aggregates/{schoolId}/sections/{sectionId}` schreiben (`importedAt = serverTimestamp()`).
3. Für jede Datei `benchmarks/{benchmark_id}.json`: nur wenn `n >= min_n_benchmark` und
   `n_schools >= min_schools_benchmark` → mit `publishable: true` schreiben; sonst ein
   vorhandenes Dokument **löschen**.
4. Reports: PDF aus `../reports/output/` nach Storage `reports/{schoolId}/{fileName}.pdf`
   hochladen (Admin SDK, `contentType: application/pdf`), dann `reports/{schoolId}` mit
   `storagePath`, `sizeBytes`, `sha256` schreiben.
5. Batches à ≤ 500; Protokoll (Anzahl geschrieben/unterdrückt/verworfen) ausgeben;
   Trockenlauf-Option `--dry-run`. Unit-Tests für Mapping- und Schwellenfunktionen (Vitest).

## 8. Rules im Emulator testen

**Sofort möglich (ohne Pakete):** `firebase/rules-smoke.mjs` – 49 REST-Fälle gegen die
Emulatoren, am 2026-10-15 alle grün:

```bash
firebase emulators:exec --project demo-alumni-pulse --only firestore,storage "node firebase/rules-smoke.mjs"
```

**Ziel-Test-Suite:** `tests/rules/firestore.rules.test.ts` mit `@firebase/rules-unit-testing`
(`initializeTestEnvironment`, `authenticatedContext(uid, { role, schoolId })`,
`assertSucceeds`/`assertFails`, Seed via `withSecurityRulesDisabled`). Eigenes Vitest-Projekt
mit `environment: 'node'`, ausgeführt über `firebase emulators:exec`.

Testfälle – gespiegelt aus den Domänenregeln (`src/domain/access.ts`,
`src/services/local/localData.ts`) und deren lokalen Unit-Tests:

**Anmeldung / Status (`canSignIn`)**

| # | Fall | Erwartung |
|---|---|---|
| R1 | aktiver School-Account liest eigene Schule | erlaubt |
| R2 | `invited`-Account liest eigene Schule | verweigert (`auth/not-activated`-Pendant) |
| R3 | `disabled`-Account mit noch gültigem Token liest eigene Schule | verweigert |
| R4 | `invited`/`disabled` liest **eigenes** `users`-Dokument | erlaubt (UI zeigt Grund) |
| R5 | unangemeldet liest irgendetwas | verweigert |
| R6 | Token ohne Claims (Claims noch nicht synchronisiert) | verweigert |

**Mandantentrennung (`canReadSchool`, `assertAdmin`)**

| # | Fall | Erwartung |
|---|---|---|
| R7 | Admin liest fremde Schule / listet alle Schulen | erlaubt |
| R8 | School liest fremde Schule | verweigert |
| R9 | School listet `schools` | verweigert (`listSchools` nur Admin) |
| R10 | Claim `schoolId` ≠ `users.schoolId` (veraltetes Token) | verweigert |
| R11 | Claim `role: admin`, Dokument `role: school` | verweigert |
| R12 | School liest eigene / fremde `aggregates/{id}/sections/*` | erlaubt / verweigert |
| R13 | School liest eigenen / fremden `reports/{id}` | erlaubt / verweigert |
| R14 | aktiver Account liest Benchmark `publishable: true` / `false` | erlaubt / verweigert |
| R15 | Benchmark-Abfrage ohne `where('publishable','==',true)` | verweigert |
| R16 | `invited` liest Benchmark | verweigert |
| R17 | School liest fremdes `users`-Dokument / listet `users` | verweigert |
| R18 | Admin listet `users` gefiltert nach `schoolId` | erlaubt |

**Statuswechsel (`setAccountStatus`)**

| # | Fall | Erwartung |
|---|---|---|
| R19 | Admin setzt `invited → active` mit `serverTimestamp()` + `updatedBy = eigene uid` | erlaubt |
| R20 | Admin setzt `active → disabled` bei anderem Account (auch anderem Admin) | erlaubt |
| R21 | Zielstatus `invited` oder unbekannter Wert | verweigert („nur active/disabled“) |
| R22 | Admin deaktiviert sich selbst | verweigert („eigener Account“) |
| R23 | `updatedBy` ≠ eigene uid | verweigert |
| R24 | `updatedAt` mit Client-Zeit statt `serverTimestamp()` | verweigert |
| R25 | zusätzlich `role`, `schoolId`, `email` oder `displayName` geändert | verweigert |
| R26 | School-Account ändert eigenen oder fremden Status | verweigert |
| R27 | Client legt `users`-Dokument an / löscht es (auch Admin) | verweigert (`inviteAccount` = Callable) |

**Audit-Log**

| # | Fall | Erwartung |
|---|---|---|
| R28 | Batch: Statuswechsel + passender Audit-Eintrag | erlaubt |
| R29 | Audit-Eintrag ohne gleichzeitiges `users`-Update | verweigert |
| R30 | falscher `fromStatus` / `toStatus` / `targetSchoolId` | verweigert |
| R31 | Zusatzfeld oder fehlendes Feld | verweigert |
| R32 | `actorUid` ≠ eigene uid | verweigert |
| R33 | Audit-Eintrag ändern oder löschen (auch Admin) | verweigert |
| R34 | School liest `auditLog` | verweigert |

**Schreibschutz und Default deny**

| # | Fall | Erwartung |
|---|---|---|
| R35 | Admin-Client schreibt `schools`, `aggregates`, `benchmarks`, `reports` | verweigert |
| R36 | beliebige unbekannte Collection | verweigert |

**Storage**

| # | Fall | Erwartung |
|---|---|---|
| S1 | School liest eigenes PDF / Admin liest beliebiges PDF | erlaubt |
| S2 | fremde Schule, `invited`, `disabled` liest PDF | verweigert |
| S3 | Nicht-PDF unter `reports/{id}/` | verweigert |
| S4 | Client-Upload (auch Admin) | verweigert |

**Functions** (Emulator, `firebase-functions-test` oder Integrationstest): `onUserWrite` setzt
Claims; `disabled` → Auth-User gesperrt + Tokens widerrufen; Wechsel zurück auf `active`
entsperrt; `inviteAccount` lehnt Nicht-Admins, ungültige E-Mails, unbekannte Schulen und
doppelte E-Mails ab.

## 9. Deployment (erst nach grünen Tests, zuerst Staging)

```bash
firebase use staging
npm run build                                   # erzeugt dist/
firebase deploy --only firestore:rules,firestore:indexes,storage
firebase deploy --only functions
firebase deploy --only hosting
```

Danach: Seed-Import (nur Admin), Aggregate-Import, Smoke-Test mit echtem Login, dann
dasselbe für `prod`. Rules-Änderungen immer zuerst im Emulator, dann Staging.

## 10. Datenschutz (Schweizer DSG / DSGVO)

- **Datenstandort:** Firestore, Storage und Functions in `europe-west6` (Zürich).
  **Achtung:** Firebase Authentication/Identity Platform verarbeitet Kontodaten (E-Mail, Name)
  global/in den USA; Hosting ist ein globales CDN (nur statische Dateien). Im
  Verarbeitungsverzeichnis dokumentieren; Google Cloud DPA + Standardvertragsklauseln
  bzw. Swiss-U.S. Data Privacy Framework prüfen.
- **Keine Einzelantworten im Client.** Firebase enthält nur Aggregate (n ≥ Schwelle),
  Stammdaten und Kontaktdaten der Hochschul-Accounts. Respondent-Daten und Freitexte bleiben in
  der Pipeline (lokal/gesicherte Umgebung).
- **Mindestfallzahl** dreifach abgesichert (Pipeline, Import, Rules) – siehe `DATA_MODEL.md`.
- **Datenminimierung bei Accounts:** nur E-Mail, Anzeigename, Rolle, Mandant, Status.
  Keine Analytics/Tracking-SDKs ohne Einwilligung.
- **Zugriffsprotokoll:** `auditLog` für Statuswechsel; Cloud Audit Logs (Data Access) für
  Admin-SDK-Zugriffe aktivieren.
- **Löschkonzept:** Accounts nach Projektende deaktivieren/löschen; Aufbewahrungsfrist für
  Reports und Aggregate festlegen; Backups (PITR/Exports) ebenfalls in `europe-west6`.
- **Download-Sicherheit:** PDFs nur über `getBlob()` (Rules greifen), keine öffentlichen
  Download-URLs.
- **Service-Account-Schlüssel** nie einchecken; bevorzugt Workload Identity / kurzlebige
  Credentials.


## KI-Interpretationen der Diagramme (vorgemerkt: Gemini im Backend)

**Stand Prototyp (2026-10-15):** Für das Sankey „Employment status“ gibt es pro Hochschule
(50 + Demo ALL) eine KI-Interpretation (Leseanleitung + Benchmark für die Hochschulleitung),
**mit Claude (Claude Code) aus den synthetischen Aggregaten erzeugt**:

* Eingaben: `portal/insights/career_employment/inputs/<id>.json` (nur Aggregate; Skript
  `scripts/build-insight-inputs.mjs`)
* Prompt: `portal/insights/career_employment/PROMPT.md` (Rolle, Schema, harte Regeln)
* Texte: `portal/insights/career_employment/texts/<id>.json`
* Prüfung: `src/domain/insights.ts → checkInsightNumbers()` – jede Prozentzahl, jede
  Differenz (pp) und jedes n im Text muss aus den Eingaben stammen (Test `tests/insights/`).
* Anzeige: violett getönte Karte „AI-generated interpretation“ vor dem Diagramm, mit Modell,
  Datum und Hinweis auf mögliche Fehler.

**Produktion (geplant, vollautomatisch):** Gemini **2.5** bzw. die dann aktuelle Gemini-Version
(vom Nutzer genannt: „Gemini 2.5 oder 3.5“) über **Vertex AI in der EU-Region** (z. B.
`europe-west6`), ausgelöst durch eine Cloud Function nach jedem Aggregat-Import:

1. Trigger: `onDocumentWritten(aggregates/{schoolId}/sections/career_salary)` (bzw. nach dem
   Import-Lauf für alle Hochschulen gebündelt).
2. Eingaben exakt wie `build-insight-inputs.mjs` aus den Firestore-Aggregaten bauen –
   **nie Einzelantworten oder Freitexte** an das Modell geben.
3. Prompt `PROMPT.md` unverändert verwenden; Antwort als JSON (Gemini „structured output“
   mit dem Schema aus PROMPT.md).
4. **Vor dem Speichern** `checkInsightNumbers()` ausführen (dieselbe Funktion, als geteiltes
   Paket in Functions). Schlägt die Prüfung fehl: bis zu 2 Neuversuche, sonst keinen Text
   veröffentlichen und im `auditLog` vermerken.
5. Speichern unter `aggregates/{schoolId}/insights/{chartId}` mit `generated_by.provider =
   "Google"`, Modell-ID, `generated_at`, `prompt_version`, `inputs_hash`. Lesen nur eigene
   Hochschule/Admin (Rule `match /insights/{chartId}` in `firebase/firestore.rules`).
6. Datenschutz: Vertrag/DPA mit Google prüfen, Datenresidenz EU, kein Training auf Kundendaten.
   Echte Daten verarbeitet nur das Backend – nie Claude Code (siehe `docs/data_governance.md`).
