# Architektur: heute und künftig

## Leitidee

Eine einzige, getestete Pipeline verwandelt einen Qualtrics-Export in **ein JSON pro
Hochschule**. Diese Dokumente sind die einzige Schnittstelle zu allem, was danach kommt:
Portal, PDF-Report und KI-Interpretation. Einzelantworten verlassen die Pipeline nie.

```mermaid
flowchart LR
  Q[Qualtrics-Export CSV] --> I[ingest]
  I --> C[clean: Fallstatus]
  C --> D[derive: Alter, Gehalt PPP, Gaps ...]
  D --> A[aggregate: Kennzahlen je Hochschule + Benchmarks + Kleinzellenschutz]
  A --> J[(schools/&lt;id&gt;.json, benchmarks/*.json)]
  J --> P[Portal]
  J --> R[PDF-Report]
  J --> K[KI-Interpretation]
```

## Heute (lokal, synthetische Daten)

```mermaid
flowchart TB
  subgraph Projektordner
    G[scripts/synthetic/generate.py\nSimulation + Problemfälle] --> RAW[data/synthetic/*.csv\nQualtrics-Format]
    TXT[Freitexte von Haiku-Agenten\n.work/text_responses] --> M[merge_texts.py] --> RAW
    RAW --> PIPE[scripts/run_pipeline.py\npipeline/*]
    PIPE --> AGG[data/processed/aggregates/\nschools, benchmarks, waves_mock]
    AGG --> VITE[Vite-Dev-Server\nPlugin localAggregates:\nliefert genau eine Datei je Hochschule]
    VITE --> UI[React-Portal\nAdmin + Hochschulsicht]
    SEED[portal/seed/*.json\nDemo-User] --> UI
  end
```

| Baustein | Technik | Ort |
|---|---|---|
| Codebook | YAML, Loader mit Tests | `codebook/`, `pipeline/codebook.py` |
| Pipeline | Python 3.12, pandas | `pipeline/`, `scripts/run_pipeline.py` |
| Schwellen und Methodik | YAML | `config/settings.yaml` |
| Laufmodi und Datenschutz | `pipeline/environment.py` | synthetisch (Standard) oder Produktion |
| Portal | React 19, TypeScript, Vite, Vitest | `portal/` |
| Diagramme | D3.js (inkl. d3-sankey) | `portal/src/ui/school/*` |
| Auth und Daten im Portal | Ports `AuthService`/`DataService`, lokaler Adapter mit localStorage | `portal/src/services/` |
| Design | CSS-Tokens (Circle) | `portal/src/styles/tokens.css`, `docs/design/` |

**Mandantentrennung lokal:** Der Dev-Server gibt pro Anfrage genau eine Datei einer
Hochschule heraus. Der `DataService` prüft vorher Rolle, Accountstatus und `schoolId`, so
wie später die Firestore-Rules. Andere Hochschulen erscheinen nur als anonyme Werte
(`peers`), ohne Namen und ohne IDs.

## Künftig (Echtdaten, Firebase, PDF)

```mermaid
flowchart TB
  QX[Qualtrics] -->|Export durch Mensch| SEC[(~/AlumniPulse_SecureData/raw\naußerhalb des Projekts)]
  SEC -->|Mensch startet im eigenen Terminal\nALUMNI_PULSE_MODE=production| PIPE[run_pipeline.py]
  PIPE --> OUT[(SecureData/processed + firestore_export)]
  OUT -->|Upload-Skript, Mensch| FS[(Firestore europe-west6\naggregates/&lt;schoolId&gt;/sections, waves\nbenchmarks)]
  OUT -->|Report-Generator| PDF[PDF je Hochschule] --> ST[(Cloud Storage)]
  FS --> FN[Cloud Functions\nKI-Interpretation mit Gemini\nnur aus Aggregaten]
  FN --> FS
  AUTH[Firebase Auth\nE-Mail-Link / SWITCH edu-ID\nCustom Claims role + schoolId] --> HOST[Portal auf Firebase Hosting]
  FS --> HOST
  ST --> HOST
```

**Was sich beim Wechsel ändert und was nicht:**
- Die UI bleibt gleich. In `portal/src/services/index.ts` wird vom lokalen Adapter auf den
  Firebase-Adapter umgeschaltet (`VITE_BACKEND=firebase`).
- Die Pipeline bleibt gleich. Nur der Laufmodus wechselt auf Produktion, gestartet von einem
  Menschen. Claude Code ist dabei technisch ausgesperrt.
- Firestore erhält nur Aggregate, die die Mindestfallzahlen erfüllen. Datenmodell:
  `portal/docs/DATA_MODEL.md`, Migrationsschritte: `portal/docs/FIREBASE_MIGRATION.md`.
- **PDF-Reports** (noch offen): aus denselben Schul-JSONs mit denselben D3-Diagrammen
  gerendert, zum Beispiel per Headless-Browser (Playwright) aus einer Druckansicht des Portals.
  So sehen Portal und PDF garantiert gleich aus. Ablage in Cloud Storage, Metadaten in
  `reports/{schoolId}`.
- **KI-Interpretationen**: Im Prototyp schreibt Claude die Texte aus den synthetischen
  Aggregaten (`portal/insights/`). Später erzeugt eine Cloud Function mit Gemini die Texte,
  ausschließlich aus den aggregierten Fakten einer Hochschule. Ein Test prüft, dass jede
  Zahl im Text aus diesen Fakten stammt.
- **Längsschnitt**: pro Welle ein Dokument `aggregates/{schoolId}/waves/{year}`. Die
  Pipeline braucht dafür einen Wellen-Parameter. Das Format liefert heute
  `scripts/synthetic/mock_waves.py`.

## Datenschutz-Schichten

Siehe `docs/data_governance.md`: (1) Speicherort außerhalb des Projekts, (2) Deny-Regeln in
`.claude/settings.json`, (3) Guard-Hook `.claude/hooks/alumni_pulse_guard.sh` für alle
Tool-Aufrufe, (4) `pipeline/environment.py` verweigert den Produktionsmodus in Claude Code.
Dazu kommen Kleinzellenschutz und Mindestfallzahlen in der Pipeline (`pipeline/suppression.py`).
