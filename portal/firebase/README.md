# Firebase-Konfiguration (ENTWURF)

> **Alle Dateien in diesem Ordner sind Entwürfe.** Nichts davon ist deployt. Es gibt noch kein
> echtes Firebase-Projekt. JSON erlaubt keine Kommentare – deshalb steht der Entwurfs-Hinweis hier.

| Datei | Inhalt |
|---|---|
| `firestore.rules` | Security Rules Firestore (Mandantentrennung, Statuswechsel, Audit-Log) |
| `storage.rules` | Security Rules Storage (PDF-Reports pro Hochschule) |
| `firestore.indexes.json` | Composite-Indizes (users, auditLog, benchmarks) |
| `firebase.json` | Hosting (`dist`, SPA-Rewrite), Rules-Pfade, Emulatoren |
| `.firebaserc.example` | Projekt-Aliasse; `default` = `demo-alumni-pulse` (nur Emulator) |
| `rules-smoke.mjs` | Rules-Smoke-Test (49 Fälle) per REST gegen die Emulatoren, ohne npm-Pakete |

## Wichtig: Lage von `firebase.json`

Die Pfade in `firebase.json` sind **relativ zu `portal/`** geschrieben (`dist`,
`firebase/firestore.rules` …). Bei der Migration `firebase.json` und `.firebaserc` nach
`portal/` kopieren (siehe `docs/FIREBASE_MIGRATION.md`, Schritt 3). Projekt-IDs mit Präfix
`demo-` funktionieren nur im Emulator – versehentliche Zugriffe auf ein echtes Projekt sind so
ausgeschlossen.

## Geprüft

Die Rules wurden am 2026-10-15 im lokalen Emulator (Projekt `demo-alumni-pulse`) mit einem
REST-Smoke-Test geprüft: 49 Fälle (Mandantentrennung, Status-Gates, Statuswechsel-Validierung,
Audit-Konsistenz, Storage) – alle wie erwartet. Ersetzt nicht die Test-Suite mit
`@firebase/rules-unit-testing` (Fallliste in `docs/FIREBASE_MIGRATION.md`).
