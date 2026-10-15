# Datenmodell Firestore – Global Alumni Pulse 2026

> **Status: Entwurf** (Stand 2026-10-15). Grundlage für die spätere Firebase-Migration des
> lokalen Demo-Portals. Vertrag im Code: `src/domain/types.ts`, `src/services/ports.ts`.
> Rules: `firebase/firestore.rules`, `firebase/storage.rules`. Migrationspfad:
> [`FIREBASE_MIGRATION.md`](FIREBASE_MIGRATION.md).

## 1. Überblick

```
schools/{schoolId}                         Stammdaten Hochschule          (Import, Admin SDK)
users/{uid}                                Accounts (uid = Auth-uid)      (Callable + Admin-Client)
aggregates/{schoolId}                      Kopf: verfügbare Sektionen     (Import)
aggregates/{schoolId}/sections/{sectionId} Kennzahlen pro Sektion         (Import)
benchmarks/{benchmarkId}                   Vergleichsgruppen-Kennzahlen   (Import)
reports/{schoolId}                         Metadaten PDF-Report           (Upload-Skript)
auditLog/{eventId}                         Statuswechsel, append-only     (Admin-Client im Batch)

Storage: reports/{schoolId}/{fileName}.pdf
```

**Leitprinzipien**

1. **Mandanten-Schlüssel `schoolId`** (z. B. `S001`) – identisch mit `school_id` aus
   `data/reference/schools.csv` und der Pipeline. Er steckt in Dokument-ID bzw. Pfad *und*
   als Feld im Dokument (für Abfragen und Plausibilitätsprüfung).
2. **Nur Aggregate im Portal.** Einzelantworten (Respondent-Ebene, Freitexte) verlassen die
   Pipeline nie Richtung Firebase. Clients lesen ausschließlich aggregierte Kennzahlen.
3. **Mindestfallzahl** (Abschnitt 10): Werte unter der Schwelle werden in der Pipeline
   unterdrückt, beim Import erneut geprüft und durch die Rules (`publishable`) ein drittes
   Mal abgesichert.
4. **Clients schreiben (fast) nie.** Einzige Client-Writes: Admin ändert `users/{uid}.status`
   und schreibt im selben Batch einen `auditLog`-Eintrag.
5. **Feldnamen camelCase** im Portal/Firestore; die Pipeline schreibt snake_case – das
   Import-Skript übersetzt (Abschnitt 9).
6. **Zeitstempel** sind in Firestore `Timestamp`, in der Domäne ISO-8601-Strings. Umrechnung
   nur im Adapter (`toIso()`/`fromIso()`).

## 2. `schools/{schoolId}`

Dokument-ID = `schoolId`. Entspricht 1:1 dem Interface `School`.

| Feld | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `schoolId` | string | ja | Mandanten-Schlüssel, = Dokument-ID (`S001` …) |
| `name` | string | ja | Voller Name |
| `shortName` | string | ja | Kürzel (`HWL`) |
| `country` | string | ja | Land (englisch) |
| `iso2` | string | ja | ISO-3166-1 alpha-2 |
| `region` | string | ja | `Europe` \| `Asia` \| `Americas` – Benchmark-Dimension |
| `subregion` | string | ja | z. B. `DACH`, `East Asia` – Benchmark-Dimension |
| `city` | string | ja | Stadt |
| `institutionType` | string | ja | `private_business_school` \| `public_university` \| `applied_sciences_university` – Benchmark-Dimension |
| `aacsb` | boolean | ja | AACSB-akkreditiert |
| `equis` | boolean | ja | EQUIS-akkreditiert |
| `bgsChapter` | boolean | ja | Beta-Gamma-Sigma-Chapter |
| `foundedYear` | number | ja | Gründungsjahr |
| `alumniBaseSize` | number | ja | Größe der Alumni-Basis |
| `rankingTier` | number | ja | 1–3 |
| `currency` | string | ja | ISO-4217 (für Gehaltsangaben) |
| `nRespondents` | number | ja | Anzahl Antworten (Demo: aus CSV; real: aus Pipeline, s. offene Fragen) |
| `notes` | string | nein | Freitext-Notiz (Stammdaten, keine Befragungsantwort) |

### Mapping CSV → `schools`

Quelle `data/reference/schools.csv`; identisch zu `mapSchool()` in `scripts/build-seed.mjs`.

| CSV-Spalte | Firestore-Feld | Umwandlung |
|---|---|---|
| `school_id` | `schoolId` (+ Dokument-ID) | – |
| `school_name` | `name` | – |
| `school_short` | `shortName` | – |
| `country`, `iso2`, `region`, `subregion`, `city`, `currency`, `notes` | gleichnamig | – |
| `institution_type` | `institutionType` | – |
| `aacsb`, `equis`, `bgs_chapter` | `aacsb`, `equis`, `bgsChapter` | `"1"` → `true`, sonst `false` |
| `founded_year`, `alumni_base_size`, `ranking_tier`, `n_respondents` | `foundedYear`, `alumniBaseSize`, `rankingTier`, `nRespondents` | `Number()` |
| `share_bachelor` … `share_phd`, `quality_effect`, `network_effect`, `ai_curriculum_effect` | – | **entfallen** (Parameter des Synthetik-Generators, nicht für das Portal) |

### Beispiel

```json
{
  "schoolId": "S001",
  "name": "Hochschule für Wirtschaft Limmattal",
  "shortName": "HWL",
  "country": "Switzerland",
  "iso2": "CH",
  "region": "Europe",
  "subregion": "DACH",
  "city": "Zurich",
  "institutionType": "applied_sciences_university",
  "aacsb": true,
  "equis": false,
  "bgsChapter": false,
  "foundedYear": 1998,
  "alumniBaseSize": 9500,
  "rankingTier": 2,
  "currency": "CHF",
  "nRespondents": 28,
  "notes": "Practice-oriented, strong industry partnerships."
}
```

## 3. `users/{uid}`

Dokument-ID = Firebase-Auth-`uid`. Entspricht dem Interface `UserAccount` (ohne Feld `uid`,
das ist die ID). **Quelle der Wahrheit** für Rolle, Mandant und Status.

| Feld | Typ | Pflicht | Beschreibung | Wer schreibt |
|---|---|---|---|---|
| `email` | string | ja | Login-E-Mail (= Auth-E-Mail) | Callable `inviteAccount` |
| `displayName` | string | ja | Anzeigename | Callable `inviteAccount` |
| `role` | `'admin'` \| `'school'` | ja | Rolle | nur Admin SDK |
| `schoolId` | string \| null | ja | Mandant; `null` nur bei `role = 'admin'` | nur Admin SDK |
| `status` | `'invited'` \| `'active'` \| `'disabled'` | ja | Account-Status | Admin-Client (nur `active`/`disabled`) |
| `createdAt` | Timestamp | ja | Anlage | Callable |
| `updatedAt` | Timestamp | ja | Letzte Änderung; Client muss `serverTimestamp()` senden | Admin-Client / Callable |
| `updatedBy` | string \| null | ja | uid des ändernden Admins | Admin-Client / Callable |

**Status-Bedeutung** (spiegelt `canSignIn()` in `src/domain/access.ts`)

| Status | Auth-User `disabled` | Login | Datenzugriff (Rules) |
|---|---|---|---|
| `invited` | `false` | technisch möglich, Adapter meldet `auth/not-activated` und meldet ab | nur eigenes `users`-Dokument |
| `active` | `false` | ja | gemäß Rolle |
| `disabled` | `true` (+ Refresh-Tokens widerrufen) | nein (`auth/user-disabled`) | nur eigenes `users`-Dokument (falls noch Token) |

### Beispiel

```json
{
  "email": "s001@demo.alumnipulse.example",
  "displayName": "Kontakt HWL",
  "role": "school",
  "schoolId": "S001",
  "status": "active",
  "createdAt": "2026-10-01T08:00:00.000Z",
  "updatedAt": "2026-10-01T08:00:00.000Z",
  "updatedBy": null
}
```

(In Firestore sind `createdAt`/`updatedAt` Timestamps; hier als ISO-String dargestellt.)

## 4. Custom Claims vs. `users`-Dokument

| | Custom Claims `{ role, schoolId }` | `users/{uid}`-Dokument |
|---|---|---|
| Rolle | **Kopie** für schnelle Prüfung im Token | **Quelle der Wahrheit** |
| Inhalt | nur `role`, `schoolId` (kein Status – wäre bis 1 h veraltet) | alle Felder inkl. `status` |
| Aktualität | erst nach Token-Refresh (≤ 1 h oder erzwungen) | sofort |
| Wer setzt | Cloud Function `onUserWrite` (`setCustomUserClaims`) | Callable / Admin-Client |
| Nutzung in Rules | `request.auth.token.role/schoolId` | `get(/users/$(uid)).data.status/role/schoolId` |

Die Rules verlangen **beides**: Claim *und* Dokument müssen Rolle/Mandant bestätigen, und das
Dokument muss `status == 'active'` zeigen. Damit gilt:

- Ein gesperrter Account verliert den Zugriff **sofort** (Dokument), nicht erst nach Ablauf
  des ID-Tokens.
- Ein veralteter oder manipulierter Claim allein gewährt nichts.
- Kosten: ein Dokument-Lesezugriff pro Anfrage (pro Request gecacht) – bei der erwarteten
  Last (≈ 1000 Hochschulen, wenige Logins/Tag) vernachlässigbar.

### Synchronisation: Cloud Function `onUserWrite` (Skizze)

Trigger auf `users/{uid}`. Setzt Claims, Auth-`disabled`-Flag und widerruft Tokens beim
Sperren. Schreibt nicht zurück in `users` (keine Trigger-Schleife). Code ist Skizze, Ordner
`functions/` wird erst bei der Migration angelegt.

```ts
// functions/src/index.ts  (SKIZZE – firebase-functions v2, firebase-admin)
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp();
setGlobalOptions({ region: 'europe-west6' }); // gleiche Region wie Firestore

/** Hält Custom Claims und Auth-Flags synchron zum users-Dokument (Quelle der Wahrheit). */
export const onUserWrite = onDocumentWritten('users/{uid}', async (event) => {
  const uid = event.params.uid;
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  const auth = getAuth();

  let authUser;
  try {
    authUser = await auth.getUser(uid);
  } catch (e: any) {
    if (e.code === 'auth/user-not-found') return; // Dokument ohne Auth-User: nichts zu tun
    throw e;
  }

  // Dokument gelöscht -> Zugriff vollständig entziehen.
  if (!after) {
    await auth.setCustomUserClaims(uid, null);
    await auth.updateUser(uid, { disabled: true });
    await auth.revokeRefreshTokens(uid);
    return;
  }

  // 1) Claims nur bei Änderung setzen (setCustomUserClaims überschreibt alle Claims).
  const claims = { role: after.role, schoolId: after.schoolId ?? null };
  const current = authUser.customClaims ?? {};
  if (current.role !== claims.role || (current.schoolId ?? null) !== claims.schoolId) {
    await auth.setCustomUserClaims(uid, claims);
  }

  // 2) Auth-Flag: nur 'disabled' sperrt den Auth-User; 'invited' bleibt anmeldbar,
  //    wird aber von Rules und Adapter abgewiesen (auth/not-activated).
  const shouldBeDisabled = after.status === 'disabled';
  if (authUser.disabled !== shouldBeDisabled) {
    await auth.updateUser(uid, { disabled: shouldBeDisabled });
  }

  // 3) Beim Sperren und bei Rollen-/Mandantenwechsel: Refresh-Tokens widerrufen.
  const becameDisabled = after.status === 'disabled' && before?.status !== 'disabled';
  const scopeChanged = before && (before.role !== after.role || before.schoolId !== after.schoolId);
  if (becameDisabled || scopeChanged) {
    await auth.revokeRefreshTokens(uid);
  }
});

/** Einladen: Auth-User + users-Dokument anlegen, Login-Link erzeugen (Versand per Mail-Dienst). */
export const inviteAccount = onCall(async (req) => {
  const caller = req.auth;
  if (caller?.token.role !== 'admin') throw new HttpsError('permission-denied', 'Nur Admins.');
  const db = getFirestore();
  const callerDoc = await db.doc(`users/${caller.uid}`).get();
  if (callerDoc.get('status') !== 'active') throw new HttpsError('permission-denied', 'Admin inaktiv.');

  const { schoolId, email, displayName } = req.data ?? {};
  // gleiche Prüfungen wie validateInvite() in src/domain/access.ts
  if (!schoolId || !displayName?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? '')) {
    throw new HttpsError('invalid-argument', 'Ungültige Einladungsdaten.');
  }
  if (!(await db.doc(`schools/${schoolId}`).get()).exists) {
    throw new HttpsError('not-found', 'Hochschule nicht gefunden.');
  }
  const user = await getAuth().createUser({ email: email.trim(), displayName: displayName.trim() });
  // Auth erzwingt eindeutige E-Mails (Fehler auth/email-already-exists -> already-exists).
  await db.doc(`users/${user.uid}`).set({
    email: email.trim(), displayName: displayName.trim(), role: 'school', schoolId,
    status: 'invited',
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    updatedBy: caller.uid,
  });
  // onUserWrite setzt danach die Claims. Login-Link:
  // await getAuth().generateSignInWithEmailLink(email, { url: 'https://<host>/login/complete', handleCodeInApp: true })
  return { uid: user.uid };
});

// Optional (Variante B zu Client-Batch): onCall 'setAccountStatus' – prüft Admin, schreibt
// users + auditLog in einer Transaktion per Admin SDK und setzt Auth-Flags sofort.
```

**Client-Seite:** Nach einem Rollen-/Mandantenwechsel muss der Client sein Token erneuern
(`getIdTokenResult(true)`); der Adapter tut das, wenn Claims fehlen oder vom Dokument
abweichen. Optional kann `onUserWrite` ein Signal-Dokument (`claimsSync/{uid}`) schreiben,
auf das der Client hört.

## 5. `aggregates/{schoolId}/sections/{sectionId}`

Pro Hochschule und Auswertungs-Sektion ein Dokument mit **nur aggregierten Werten**.

**Sektionen** (Vorschlag, orientiert an den Codebook-Blöcken):

| `sectionId` | Inhalt | Codebook-Quelle (Beispiele) |
|---|---|---|
| `overview` | Rücklauf, Abschlüsse, Demografie-Verteilungen | Demographics, Education |
| `program_nps` | NPS, Zufriedenheit, Programmbewertung, Skills-Gap | Evaluation (`pgm_nps`, `pgm_rate_*`, `pgm_skill_*`) |
| `career_salary` | Beschäftigung, Branche, Funktion, Gehalt (Median/Quartile) | Employment, Industry, Function, Salary |
| `wellbeing_outlook` | Karriere-Zufriedenheit, Wohlbefinden, Stress, Ausblick | Sec IV (`car_*`, `wb_*`, `out_*`) |
| `ai_focus` | KI-Nutzung, KI in der Organisation, KI-Ausblick | AI, AI_Organisation, AI Outlook |
| `continuing_education` | Weiterbildung (optional) | contin_ed_overview |

| Feld | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `schoolId` | string | ja | = Pfad-Segment (Plausibilitätsprüfung beim Import) |
| `sectionId` | string | ja | = Dokument-ID |
| `surveyWave` | string | ja | z. B. `"2026"` |
| `n` | number | ja | Anzahl gültiger Antworten der Sektion (Basis) |
| `suppressed` | boolean | ja | `true`, wenn `n < minN` → `metrics` ist leer |
| `minN` | number | ja | angewandte Schwelle (aus Pipeline-Manifest) |
| `metrics` | map | ja | Kennzahlen, Schlüssel = Metrik-ID (siehe unten) |
| `generatedAt` | Timestamp | ja | Zeitpunkt der Berechnung in der Pipeline |
| `pipelineVersion` | string | ja | Version/Commit der Pipeline (Nachvollziehbarkeit) |
| `importedAt` | Timestamp | ja | Zeitpunkt des Imports nach Firestore |

**Struktur einer Metrik** (einheitlich, damit UI-Komponenten generisch bleiben):

| Feld | Typ | Beschreibung |
|---|---|---|
| `value` | number \| null | Kennzahl; `null`, wenn unterdrückt |
| `n` | number | Basis dieser Kennzahl (kann < Sektions-n sein, Filterfragen) |
| `suppressed` | boolean | `true`, wenn `n < minNItem` |
| `unit` | string | `share` (0–1), `score`, `mean`, `currency`, `count` |
| `dist` | map<string, number> | optional: Anteile je Antwortkategorie (Summe 1), **keine Rohzählungen** |
| `label` | string | optional: Anzeigetext (sonst UI-Wörterbuch) |

Optional zusätzlich das Kopf-Dokument `aggregates/{schoolId}` mit
`{ schoolId, surveyWave, sections: ['overview', …], generatedAt, pipelineVersion }`.

### Beispiel `aggregates/S001/sections/program_nps`

```json
{
  "schoolId": "S001",
  "sectionId": "program_nps",
  "surveyWave": "2026",
  "n": 28,
  "suppressed": false,
  "minN": 10,
  "metrics": {
    "nps":              { "value": 21.4, "n": 28, "suppressed": false, "unit": "score" },
    "promoters":        { "value": 0.43, "n": 28, "suppressed": false, "unit": "share" },
    "detractors":       { "value": 0.21, "n": 28, "suppressed": false, "unit": "share" },
    "satisfaction":     { "value": 3.9,  "n": 27, "suppressed": false, "unit": "mean",
                          "dist": { "1": 0.04, "2": 0.07, "3": 0.15, "4": 0.48, "5": 0.26 } },
    "rate_network":     { "value": 3.4,  "n": 26, "suppressed": false, "unit": "mean" },
    "skill_gap_ai":     { "value": null, "n": 4,  "suppressed": true,  "unit": "mean" }
  },
  "generatedAt": "2026-11-02T10:15:00.000Z",
  "pipelineVersion": "0.3.0+a1b2c3d",
  "importedAt": "2026-11-02T10:20:00.000Z"
}
```

## 6. `benchmarks/{benchmarkId}`

Ein Dokument pro **Vergleichsgruppe × Sektion**. Flach gehalten, damit die UI mit einfachen
Gleichheits-Filtern auskommt.

**ID-Schema:** `{groupType}__{groupKey}__{sectionId}` (nur `[a-z0-9_-]`), z. B.
`all__all__program_nps`, `region__europe__career_salary`,
`type__private_business_school__ai_focus`, `subregion__dach__wellbeing_outlook`.

| `groupType` | `groupKey` (Beispiele) | Quelle |
|---|---|---|
| `all` | `all` | alle Hochschulen |
| `region` | `europe`, `asia`, `americas` | `schools.region` |
| `subregion` | `dach`, `east_asia` … | `schools.subregion` |
| `type` | `private_business_school`, `public_university`, `applied_sciences_university` | `schools.institutionType` |
| `accreditation` | `aacsb`, `equis`, `triple_crown` (optional) | Flags |

| Feld | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `benchmarkId` | string | ja | = Dokument-ID |
| `groupType` | string | ja | siehe Tabelle |
| `groupKey` | string | ja | siehe Tabelle |
| `label` | string | ja | Anzeigename, z. B. „Europa“ |
| `sectionId` | string | ja | wie bei `aggregates` |
| `surveyWave` | string | ja | `"2026"` |
| `n` | number | ja | Antworten in der Gruppe |
| `nSchools` | number | ja | Hochschulen in der Gruppe |
| `minN` | number | ja | Schwelle Antworten (z. B. 30) |
| `minSchools` | number | ja | Schwelle Hochschulen (z. B. 5) |
| `publishable` | boolean | ja | `n >= minN && nSchools >= minSchools`; Rules lesen nur `true` |
| `metrics` | map | ja | gleiche Metrik-Struktur wie bei `aggregates` |
| `generatedAt` | Timestamp | ja | Pipeline-Lauf |
| `pipelineVersion` | string | ja | Pipeline-Version |
| `importedAt` | Timestamp | ja | Import |

**Nicht enthalten:** Liste der Hochschulen der Gruppe, Einzelwerte einzelner Hochschulen,
Einzelantworten. Die Zuordnung „meine Schule → meine Gruppen“ leitet die UI aus dem eigenen
`schools`-Dokument ab (`region`, `subregion`, `institutionType`).

### Beispiel `benchmarks/region__europe__program_nps`

```json
{
  "benchmarkId": "region__europe__program_nps",
  "groupType": "region",
  "groupKey": "europe",
  "label": "Europa",
  "sectionId": "program_nps",
  "surveyWave": "2026",
  "n": 742,
  "nSchools": 25,
  "minN": 30,
  "minSchools": 5,
  "publishable": true,
  "metrics": {
    "nps":          { "value": 18.9, "n": 742, "suppressed": false, "unit": "score" },
    "satisfaction": { "value": 3.8,  "n": 731, "suppressed": false, "unit": "mean" }
  },
  "generatedAt": "2026-11-02T10:15:00.000Z",
  "pipelineVersion": "0.3.0+a1b2c3d",
  "importedAt": "2026-11-02T10:20:00.000Z"
}
```

## 7. `reports/{schoolId}` und Storage

| Feld | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `schoolId` | string | ja | = Dokument-ID |
| `surveyWave` | string | ja | `"2026"` |
| `storagePath` | string | ja | `reports/S001/alumni_pulse_2026_S001.pdf` |
| `fileName` | string | ja | Download-Dateiname |
| `sizeBytes` | number | ja | Dateigröße |
| `sha256` | string | ja | Prüfsumme (Integrität) |
| `generatedAt` | Timestamp | ja | Erzeugung (Pipeline `reports/`) |
| `pipelineVersion` | string | ja | Pipeline-Version |
| `uploadedAt` | Timestamp | ja | Upload |

Storage-Pfad: `reports/{schoolId}/{fileName}.pdf`. Lesen nur eigene Hochschule/Admin, Clients
schreiben nie (`firebase/storage.rules`). Client lädt mit `getBlob()`, **nicht**
`getDownloadURL()` (Token-URL wäre weitergebbar und umginge die Rules).

```json
{
  "schoolId": "S001",
  "surveyWave": "2026",
  "storagePath": "reports/S001/alumni_pulse_2026_S001.pdf",
  "fileName": "alumni_pulse_2026_S001.pdf",
  "sizeBytes": 1843200,
  "sha256": "9f2c…",
  "generatedAt": "2026-11-02T11:00:00.000Z",
  "pipelineVersion": "0.3.0+a1b2c3d",
  "uploadedAt": "2026-11-02T11:05:00.000Z"
}
```

## 8. `auditLog/{eventId}`

Append-only. `eventId` = Auto-ID. Wird im **selben Batch** wie das `users`-Update geschrieben;
die Rules prüfen per `get()`/`getAfter()`, dass `fromStatus`/`toStatus`/`targetSchoolId` und
die Serverzeit zum Update passen. Kein Update, kein Delete – auch nicht für Admins.

| Feld | Typ | Beschreibung |
|---|---|---|
| `type` | string | `account.status_changed` (weitere Typen später, z. B. `account.invited`) |
| `targetUid` | string | betroffener Account |
| `targetSchoolId` | string \| null | Mandant des Accounts (Filter pro Hochschule) |
| `fromStatus` | string | Status vorher |
| `toStatus` | `'active'` \| `'disabled'` | Status nachher |
| `actorUid` | string | handelnder Admin (= `request.auth.uid`) |
| `at` | Timestamp | `serverTimestamp()` (= `request.time`) |

```json
{
  "type": "account.status_changed",
  "targetUid": "u-S007",
  "targetSchoolId": "S007",
  "fromStatus": "disabled",
  "toStatus": "active",
  "actorUid": "admin-demo",
  "at": "2026-11-03T09:12:44.120Z"
}
```

**Grenze der Rules:** Rules können nicht erzwingen, dass zu *jedem* Statuswechsel ein
Audit-Eintrag existiert (ein Admin-Client könnte nur `users` aktualisieren). Wenn das
revisionssicher sein muss: Audit serverseitig in `onUserWrite` schreiben oder
`setAccountStatus` als Callable Function (Variante B).

## 9. Austauschformat Pipeline → Firestore (`portal/firestore_export/`)

> **Aktualisiert 2026-10-15 (10:00): Tatsächliches Pipeline-Format.** Die Datenpipeline
> schreibt inzwischen (synthetische) Aggregate – **eine Datei pro Hochschule** statt einer
> pro Sektion:
>
> ```
> data/processed/aggregates/schools/{school_id}.json      (z. B. S001.json)
> data/processed/aggregates/benchmarks/{gruppe}.json       (all.json, region__Europe.json,
>                                                          aacsb__1.json, ranking_tier__2.json,
>                                                          institution_type__….json)
> ```
>
> Schul-Datei: `{ school{school_id, school_name, …}, n, published, metrics{"program.nps": …,
> "career.salary_ppp_fte.median": …}, benchmarks{"all"|"region=Europe"|…: {label, n_schools, n,
> metrics}}, percentile_ranks{metric: {gruppe: Perzentil}} }`. Metrik-Schlüssel sind
> punktgetrennt; das Präfix (`program.`, `career.`, `ai.`, `skills.` …) bestimmt die Sektion.
>
> **Import-Mapping (verbindlich ab jetzt):** Das Import-Skript zerlegt jede Schul-Datei nach
> Metrik-Präfix in `aggregates/{schoolId}/sections/{sectionId}` (Zuordnung Präfix → sectionId
> als Tabelle im Skript, z. B. `program.*` → `program_nps`, `career.*` → `career_salary`,
> `ai.*`/`skills.ai*` → `ai_focus`) und legt `benchmarks`/`percentile_ranks` in
> `benchmarks/{groupType}__{groupKey}__{sectionId}` bzw. als Feld `percentileRanks` der Sektion
> ab. `published == false` → nur Kopf-Dokument mit `suppressed: true`, keine Kennzahlen.
> Mindestfallzahlen kommen aus `config/settings.yaml`. Das Portal liest **nur** diese
> Aggregate, nie Einzelantworten (siehe `../docs/data_governance.md`).
>
> **Frage 1 / Wellen (ergänzt 2026-10-15, 10:30):** Schul-Dateien enthalten zusätzlich
> `demographics.age.{median,q1,q3,mean}`, `demographics.age_gender.pyramid`,
> `demographics.gender.dist` und je Benchmark `peers` (anonyme Werte anderer Hochschulen,
> ohne Namen/IDs). `aggregates/waves_mock/{school_id}.json` liefert simulierte Wellen
> 2022–2026 (`simulated: true`, `own[year]` oder `null` = noch nicht in der Studie,
> `benchmarks[key].waves[year] = {band{median,p25,p75,n_schools}, peers[]}`).
> Firestore-Ziel: `aggregates/{schoolId}/waves/{year}` mit Feldern `own`, `benchmarks`,
> `simulated`; Lesen nur eigene Hochschule/Admin (gleiche Rule wie `sections`).
> Mapping im Portal: `src/domain/age.ts`.
>
> Der folgende ursprüngliche Vorschlag (eine Datei pro Sektion, `manifest.json`) bleibt als
> Zielbild für `portal/firestore_export/` stehen, ist aber mit der Pipeline-Session abzustimmen.

Ursprünglicher Vorschlag (snake_case wie in der Pipeline, ISO-Zeitstempel):

```
portal/firestore_export/
  manifest.json
  aggregates/{school_id}/{section_id}.json
  benchmarks/{benchmark_id}.json
  reports/{school_id}.json          (Metadaten; PDF aus reports/output/)
```

`manifest.json`:

```json
{
  "pipeline_version": "0.3.0+a1b2c3d",
  "generated_at": "2026-11-02T10:15:00Z",
  "survey_wave": "2026",
  "thresholds": { "min_n_section": 10, "min_n_item": 5, "min_n_benchmark": 30, "min_schools_benchmark": 5 },
  "sections": ["overview", "program_nps", "career_salary", "wellbeing_outlook", "ai_focus"],
  "files": { "aggregates": 250, "benchmarks": 85, "reports": 50 }
}
```

Aggregat-Datei (`aggregates/S001/program_nps.json`): Felder wie in Abschnitt 5, aber
snake_case (`school_id`, `section_id`, `generated_at`, `pipeline_version`, `metrics.*` gleich).
Benchmark-Datei analog (`group_type`, `group_key`, `n_schools`, `min_n`, `min_schools`).

**Import-Regeln** (Skript, Admin SDK):

1. `school_id` aus Pfad = Feld im JSON = existierendes `schools`-Dokument, sonst Abbruch.
2. snake_case → camelCase; ISO-Strings → `Timestamp`; `importedAt = serverTimestamp()`.
3. Mindestfallzahl erneut prüfen: Sektion mit `n < min_n_section` → `suppressed: true`,
   `metrics: {}`; Metrik mit `n < min_n_item` → `value: null, suppressed: true`; Benchmark
   mit `n < min_n_benchmark` oder `n_schools < min_schools_benchmark` → **nicht importieren**
   (und vorhandenes Dokument löschen); sonst `publishable: true`.
4. Verbotene Inhalte abweisen: Schlüssel wie `ResponseId`, `respondent_id`, `*_TEXT`,
   `*_txt`, `*_tx`, Arrays von Objekten (Hinweis auf Datensätze), E-Mail-Adressen.
5. Schreiben in Batches à ≤ 500 Writes; vollständiger Ersatz pro Welle (alte Sektionen einer
   Hochschule, die im Manifest fehlen, werden gelöscht).

## 10. Mindestfallzahl-Prinzip

Ziel: Keine Rückschlüsse auf einzelne Alumni und keine Rekonstruktion einzelner Hochschulen
über Benchmarks.

| Ebene | Schwelle (Vorschlag) | Wirkung |
|---|---|---|
| Sektion einer Hochschule | `n >= 10` | sonst ganze Sektion „zu wenige Antworten“ |
| Einzelne Kennzahl / Kategorie | `n >= 5` | sonst `value: null`, `suppressed: true` |
| Sensible Kennzahlen (Gehalt) | `n >= 10` pro Zelle | Median/Quartile erst ab 10 |
| Benchmark-Gruppe | `n >= 30` **und** `nSchools >= 5` | sonst kein Dokument |
| Verteilungen | nur Anteile, keine Rohzählungen | erschwert Differenzbildung |

Die verbindlichen Werte kommen aus der Pipeline (`manifest.thresholds`) und werden je Dokument
in `minN`/`minSchools` mitgeschrieben, damit die UI sie anzeigen kann
(„Benchmark ab 30 Antworten aus mind. 5 Hochschulen“).

Dreifache Absicherung: **Pipeline** (unterdrückt) → **Import** (prüft erneut, verwirft) →
**Rules** (`benchmarks` nur mit `publishable == true`). Freitexte werden nie exportiert.

## 11. Indizes (`firebase/firestore.indexes.json`)

| Collection | Felder | Abfrage |
|---|---|---|
| `users` | `schoolId` ↑, `status` ↑ | Accounts einer Schule nach Status (Admin-Liste, Status „partial“) |
| `users` | `role` ↑, `status` ↑ | z. B. alle aktiven Admins |
| `users` | `schoolId` ↑, `email` ↑ | `listAccounts(schoolId)` sortiert nach E-Mail |
| `auditLog` | `targetUid` ↑, `at` ↓ | Verlauf eines Accounts |
| `auditLog` | `targetSchoolId` ↑, `at` ↓ | Verlauf einer Hochschule |
| `benchmarks` | `publishable` ↑, `sectionId` ↑, `groupType` ↑ | Benchmarks einer Sektion (Rules verlangen `publishable`-Filter) |

Einzelfeld-Indizes legt Firestore automatisch an. `aggregates` wird nur per Pfad gelesen –
keine Indizes nötig. Für `metrics` könnte ein Field-Override (Indexierung aus) Kosten sparen.

## 12. Offene Fragen

1. **Mehrere Befragungswellen** (2026, 2027 …): Welle im Pfad
   (`aggregates/{schoolId}/waves/{wave}/sections/{sectionId}`) oder nur Feld `surveyWave`?
   Für Zeitreihen empfiehlt sich der Pfad.
2. **Benchmark inkl. oder exkl. eigener Schule** („leave-one-out“)? Exklusiv ist methodisch
   sauberer, braucht aber pro Schule eigene Benchmark-Dokumente (Pfad unter `aggregates`).
3. **Gehalts-Benchmarks über Währungen**: Umrechnung (USD/PPP) in der Pipeline festlegen.
4. **`nRespondents`** in `schools`: aus CSV (Demo) oder aus Pipeline (real, nach Bereinigung)?
5. **Mindestfallzahlen**: Werte mit Projektleitung/Datenschutz abstimmen.
