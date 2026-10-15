# Global Alumni Pulse 2026 – Portal (lokale Demo)

Web-Portal zur Studie *Global Alumni Pulse 2026* (ZHAW SML mit Financial Times, AACSB,
Beta Gamma Sigma). Zwei Sichten:

- **Admin:** alle gebenchmarkten Hochschulen (Suche, Filter nach Region/Land/Zugangsstatus),
  Accounts je Hochschule freischalten/deaktivieren (mit Zeitstempel und „von wem“),
  Account einladen (Mock, **kein** E-Mail-Versand).
- **Hochschule:** nach dem Login nur die eigene Hochschule (Mandantentrennung über `schoolId`).
  Erste echte Auswertung: **„Wer hat geantwortet?“ (Frage 1, Alter)** mit Alterspyramide
  (eigene Hochschule vs. wählbarer Benchmark) und Median-Alter vs. anonyme Peers inkl.
  Wellen-Regler 2022–2026 (Vorjahre simuliert, als Mock-up gekennzeichnet).
  Im Bereich **„Career & salary“**: Sankey **„Employment status“** (Karriere Frage 1) mit
  Vergleich Your school / eigene Region / All schools; ausgeblendete Kleinzellen (< 3 Personen)
  erscheinen als neutraler schraffierter Rest-Strom und werden unter dem Diagramm aufgelistet.
  Davor steht eine **KI-Interpretation** (Leseanleitung + Benchmark, deutlich als „AI-generated“
  markiert) – im Prototyp mit Claude aus synthetischen Daten erzeugt, später automatisch mit
  Gemini im Backend (siehe `insights/` und `docs/FIREBASE_MIGRATION.md`). Die übrigen
  Bereiche (Überblick/KPIs, Programmbewertung & NPS, Karriere & Gehalt, Wellbeing & Outlook,
  KI-Schwerpunkt, Benchmark, PDF-Report) sind noch Platzhalter.

> **Lokale Demo.** Kein Passwort, keine echten Accounts, keine Secrets. Der Login ist eine
> Auswahl von Demo-Usern. Der Zustand (Statuswechsel, Einladungen) liegt im `localStorage`
> des Browsers und bleibt nach Reload erhalten; „Demo-Daten zurücksetzen“ stellt den Seed wieder her.
> Nichts davon ist auf Firebase deployt.

## Datenschutz-Regel (verbindlich)

Echtdaten aus Qualtrics werden **nie** von Claude Code oder anderen KI-Assistenten verarbeitet,
sondern nur von lokalen Skripten, die ein Mensch startet, oder in Firebase. Das Portal liest
ausschließlich **aggregierte** JSON-Dokumente pro Hochschule (`data/processed/aggregates/schools/<school_id>.json`,
Benchmarks in `.../aggregates/benchmarks/`), nie Einzelantworten. Lokal wird nur gegen
synthetische Daten entwickelt. Details: [`../docs/data_governance.md`](../docs/data_governance.md)
und [`../CLAUDE.md`](../CLAUDE.md).

## Starten

Voraussetzung: Node ≥ 20 (getestet mit Node 24, npm 11).

```bash
cd portal
npm install          # einmalig
npm run dev          # erzeugt den Seed und startet http://localhost:5174
```

Aus dem Projektroot geht es auch mit einem Befehl (das nutzt `.claude/launch.json`, Eintrag `portal`):

```bash
npm --prefix portal run dev
```

Demo-Accounts (aus `seed/users.json`):

| Account | Status |
|---|---|
| `admin-demo` – Study admin (demo) | aktiv |
| `u-S001` … `u-S050` – je ein Kontakt pro Hochschule | aktiv |
| `u-S007`, `u-S014`, `u-S021`, `u-S028`, `u-S035` | **deaktiviert** → Login gesperrt |
| `u-S010`, `u-S020`, `u-S030` | **eingeladen** → noch nicht freigeschaltet |
| `u-S001-b` (eingeladen), `u-S002-b` (aktiv) | Zweitaccounts |

### Woher kommen die Auswertungsdaten?

Der Dev-Server liefert die **synthetischen** Aggregate der Pipeline aus
`../data/processed/aggregates/` aus – pro Anfrage genau eine Datei einer Hochschule
(`/local-aggregates/schools/S001.json`, `/local-aggregates/waves_mock/S001.json`, Plugin
`localAggregates` in `vite.config.ts`). Der `DataService` prüft vorher Rolle, Status und
`schoolId`; eine Hochschule fordert nie fremde Dateien an. Andere Hochschulen erscheinen
nur als anonyme Werte („Peers“). Fehlen die Dateien, zeigt das Portal „Für diese Hochschule
liegen noch keine Auswertungen vor“. Neu erzeugen: Pipeline (andere Session) laufen lassen.

### Gepoolte Demo-Sicht „ALL“

Der Account `u-ALL` (Hochschul-ID `ALL`) zeigt die Kundensicht über **alle Hochschulen gepoolt**
(Daten: `aggregates/schools/ALL.json`, `waves_mock/ALL.json`). Kennzeichnung: gelber Banner
„Demo view: all participating schools pooled“. Leere Stammdaten (Land, Tier, AACSB) werden
ausgeblendet; im Punktdiagramm steht der gepoolte Wert als „All (pooled)“, die 50 Hochschulen als
anonyme graue Punkte; statt Perzentilrang erscheint „Schools pooled“, einen Region-Umschalter gibt
es nicht. In der Admin-Liste zählt ALL nicht als Hochschule, sondern steht unter „Demo views“.
Lesen dürfen ALL nur Admins und der Demo-Account (siehe Kommentar in `firebase/firestore.rules`).

### Demo-Schnellzugang (ohne Login-Seite)

Nur in der lokalen Demo: Diese Links melden direkt an und ersetzen eine bestehende Sitzung.
Gesperrte Accounts (deaktiviert/eingeladen) bleiben gesperrt.

| Link | Öffnet |
|---|---|
| http://localhost:5174/demo | Hochschul-Sicht von S001 |
| http://localhost:5174/demo/S022 | Hochschul-Sicht von S022 (beliebige ID `S001`–`S050`) |
| http://localhost:5174/demo/S022/demographics | direkt den Bereich „Wer hat geantwortet?“ |
| http://localhost:5174/demo/ALL | **Demo-Sicht „All participating schools (demo)“** – alle Hochschulen gepoolt |
| http://localhost:5174/demo/admin | Admin-Sicht |

Eingeloggt bleibt man auch nach Reload. Zum Wechseln dient das Feld **„Ansicht wechseln
(Demo)“** in der Seitenleiste: Es listet Admin und alle aktiven Hochschul-Accounts. Beim Wechsel
zwischen Hochschulen bleibt der geöffnete Bereich erhalten. Mit dem Firebase-Backend
(`demoMode: false`) gibt es weder die Links noch den Umschalter.

## Weitere Befehle

| Befehl | Zweck |
|---|---|
| `npm test` | alle Unit-Tests (Vitest, jsdom) |
| `npm run typecheck` | TypeScript-Prüfung |
| `npm run build` | Produktions-Build nach `dist/` (später Firebase Hosting) |
| `npm run seed` | `seed/*.json` aus `../data/reference/schools.csv` neu erzeugen |

Die Tests decken ab: CSV-Parser und Seed, Filter- und Statuslogik (`src/domain`),
Zugriffsregeln (Rollen, Mandantentrennung, Sperren), lokalen Auth-/Datenadapter inkl.
Persistenz über „Reload“, Speicher-Hülle, Anzeige-Helfer und die UI (Route-Guards, Login-Fehler,
Admin-Liste/-Filter, Freischalten/Deaktivieren, Einladen, Hochschul-Skeleton).

## Architektur

```
src/
  domain/          reine Logik, ohne React/Browser – leicht testbar
    types.ts       Datentypen (= Firestore-Dokumente) und PortalError
    schools.ts     Filter, Zugangsstatus je Hochschule, Filter-Optionen
    access.ts      Zugriffsregeln (Login erlaubt? admin? eigene Hochschule?)
    age.ts         Frage 1: Pipeline-Aggregate -> Diagramm-Daten, Perzentilrang, Delta
  services/
    ports.ts       Schnittstellen AuthService / DataService  ← die UI kennt nur diese
    index.ts       DIE Austauschstelle: heute lokaler Adapter, später Firebase
    local/         lokaler Adapter (localStorage) + Speicher-Hülle
    firebase/      Skizze des Firebase-Adapters (noch nicht aktiv)
  ui/              React-Komponenten; Services kommen über ServicesContext
    admin/         Admin-Liste und -Detail
    school/        Hochschul-Sicht; Bereiche als Daten in sections.ts
      demographics/  Frage 1 (Alter): Seite, Alterspyramide, Median-vs.-Peers + Trend
  styles/
    tokens.css     Design-Tokens (Farben, Abstände, Radien, Fonts, Light/Dark)
    app.css        Komponenten-Styles, nur über Tokens
scripts/           Seed-Erzeugung aus der Referenz-CSV
seed/              generierte Demo-Daten (schools.json, users.json)
firebase/          Entwürfe: firestore.rules, storage.rules, firebase.json, Indizes
docs/              Datenmodell und Firebase-Migrationspfad
tests/             Unit-Tests (domain, services, scripts, ui)
```

**Prinzip:** Die UI ruft nur `AuthService`/`DataService` auf. Jede Datenmethode prüft wie
später die Firestore-Rules zweimal: Ist der handelnde Account *jetzt* noch aktiv, und darf
seine Rolle das? Ein deaktivierter Account kann sich deshalb nicht einloggen, und eine bereits
offene Sitzung verliert sofort den Datenzugriff.

**Branding:** Alle Farben, Schriften, Radien und Abstände stehen als CSS-Variablen in
`src/styles/tokens.css` (Light- und Dark-Block). Eigene Vorgaben werden nur dort eingespielt.

**Neue Auswertung einhängen:** In `src/ui/school/sections.ts` sind die Bereiche als Daten
definiert. Ihre `id`s entsprechen den `sectionId`s in Firestore (`overview`, `program_nps`,
`career_salary`, `wellbeing_outlook`, `ai_focus`). Für echte Kennzahlen kommt später eine
Methode wie `getSectionAggregates(session, schoolId, sectionId)` in den `DataService`.

## Design

Design-System **„Circle / PostPlan“** des Nutzers (Vorlage `../docs/design/`), mit einer Anpassung:
**blauer Touch** statt rosa/magenta (Hintergrund-Verläufe und Akzentwort der Überschriften blau;
Koralle nur für Fehler/negative Werte).

* Alle Farben stehen in `src/styles/tokens.css`: Teil 1 = Circle-Basistokens (Light/Dark),
  Teil 2 = Portal-Aliase. Komponenten-CSS enthält keine Farbwerte.
* Schriften Instrument Serif (Überschriften) und Inter (UI) werden **lokal** über `@fontsource`
  geladen – kein Abruf bei Google Fonts.
* Überschriften: Serif mit einem Akzentwort (`<em>` bzw. `components/Headline.tsx`,
  in `sections.ts` über das Feld `accent`).
* Kontraste (WCAG) rechnerisch geprüft: Fliesstext, Meta-Text, Links, Pills und Buttons
  ≥ 4.5:1 in Light und Dark. Dafür zwei Abweichungen vom Original: `--ink-meta` statt
  `--ink-3` für kleinen Text, Akzentblau für weisse Schrift leicht abgedunkelt.
* Diagramme: eigene Hochschule blau, Peers grau, Benchmark gestrichelt, Pyramide Frauen
  violett / Männer blau, ausgeblendete Zellen („< 3“) schraffiert.

## Datenmodell (Kurzfassung)

Firestore-artig, Details in [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md):

| Pfad | Inhalt | Schreibt |
|---|---|---|
| `schools/{schoolId}` | Stammdaten (aus `schools.csv`) | Import-Skript |
| `users/{uid}` | `role` (admin/school), `schoolId`, `status` (invited/active/disabled), `createdAt`, `updatedAt`, `updatedBy` | Admin (nur Status), Functions |
| `aggregates/{schoolId}/sections/{sectionId}` | aggregierte Kennzahlen je Bereich, nur ab Mindestfallzahl | Import-Skript |
| `aggregates/{schoolId}/waves/{year}` | Zeitreihe je Befragungswelle (eigene Werte, Benchmark-Band, anonyme Peers) | Import-Skript |
| `benchmarks/{id}` | Vergleichsgruppen (Region, Typ, AACSB, Tier, gesamt), nur ab Mindestfallzahl | Import-Skript |
| `reports/{schoolId}` | Metadaten zum PDF (Datei in Storage) | Import-Skript |
| `auditLog/{eventId}` | Protokoll der Statuswechsel (append-only) | Admin / Function |

Rollen kommen später als Custom Claims `{ role, schoolId }` ins ID-Token. Quelle der Wahrheit
für den Status bleibt `users/{uid}`.

## Firebase-Migrationspfad (Kurzfassung)

Schritt für Schritt in [`docs/FIREBASE_MIGRATION.md`](docs/FIREBASE_MIGRATION.md):

1. Firebase-Projekt anlegen (Region `europe-west6`, Zürich), `npm i firebase`.
2. `.env` mit `VITE_BACKEND=firebase` und `VITE_FIREBASE_*` anlegen.
3. Firebase-Adapter nach der Skizze in `src/services/firebase/` bauen und in
   `src/services/index.ts` einschalten. Die UI bleibt unverändert.
4. Login auf E-Mail-Link bzw. SSO umstellen. Dafür braucht der Port voraussichtlich
   `sendLoginLink`/`completeSignIn` statt `signIn(uid)`.
5. Cloud Function `onUserWrite`: Custom Claims setzen, gesperrte Accounts deaktivieren und
   Tokens widerrufen. `inviteAccount` als Callable Function.
6. `schools`/`users` per Admin-SDK-Skript importieren. Die Aggregate lädt ein Mensch per Skript
   aus dem sicheren Export-Ordner hoch (siehe Datenschutz-Regel).
7. Rules im Emulator testen (`firebase/rules-smoke.mjs`, später `@firebase/rules-unit-testing`),
   dann Hosting, Rules und Functions deployen.

Die Dateien in `firebase/` sind **Entwürfe** und wurden nicht deployt.

## Offene Punkte

- Port-Erweiterung für den echten Login (E-Mail-Link/SSO, z. B. SWITCH edu-ID) und für Kennzahlen.
- Audit-Log: Die Rules erzwingen keinen Audit-Eintrag pro Statuswechsel. Für ein lückenloses
  Protokoll sollte die Cloud Function den Eintrag schreiben.
- Mindestfallzahlen, Benchmark-Definition (mit oder ohne eigene Hochschule) und Datenschutzfragen
  zu Firebase Auth (Datenverarbeitung außerhalb der EU) sind mit Projektleitung und
  Datenschutz abzustimmen.
