# Willkommen im Projekt Global Alumni Pulse 2026

**Hallo Pia, schön, dass du übernimmst!**

Dieser Ordner enthält alles, was bisher für die Auswertung der Alumni-Befragung
entstanden ist: synthetische Testdaten, die Auswertungs-Pipeline, ein lokal laufendes
Portal mit Admin- und Hochschulsicht und die ersten abgenommenen Diagramme. Diese Seite
gibt dir in fünf Minuten den Überblick. Die Details stehen in den verlinkten Dokumenten.

> **Am einfachsten startest du so:** Öffne den Ordner in Claude Code und tippe `/start`.
> Claude begrüßt dich, erklärt den Stand und hilft dir beim Einrichten und Weitermachen,
> zum Beispiel beim Starten des Portals oder beim nächsten Diagramm.

---

## 1. Worum es geht

Die Studie befragt Alumni von Business Schools weltweit (über 1000 Hochschulen geplant)
zu Karriere, Gehalt, Bewertung ihres Studiums, Wellbeing und KI-Nutzung. Pro Hochschule
soll es einen **PDF-Report** und ein **Online-Portal (Firebase)** geben, in dem sich jede
Hochschule einloggt und ihre Ergebnisse mit Benchmarks vergleicht.

Weil die Feldphase noch nicht begonnen hat, arbeitet alles mit **synthetischen Daten**:
50 fiktive Hochschulen (25 Europa, 10 Amerika, 15 Asien) und 1'499 gültige Interviews im
exakten Qualtrics-Exportformat. Die gleiche Pipeline läuft später unverändert auf den
Echtdaten.

## 2. Die Entwicklungsstränge auf einen Blick

| # | Strang | Stand | Wo |
|---|---|---|---|
| 1 | **Fragebogen & Codebook**: alle Variablen, Codes, Skip-Logik maschinenlesbar | fertig; Branchen-/Funktionslabels als PLACEHOLDER mit Qualtrics abgleichen | `codebook/` |
| 2 | **Synthetische Daten**: Generator, Problemfälle, Freitexte | fertig, nach QA nachkalibriert (v2) | `scripts/synthetic/`, `data/synthetic/`, [Doku](docs/SYNTHETISCHE_DATEN.md) |
| 3 | **Auswertungs-Pipeline**: Bereinigung, Kennzahlen, Benchmarks, Kleinzellenschutz | läuft, 103 Python-Tests grün | `pipeline/`, `scripts/run_pipeline.py` |
| 4 | **Diagramme pro Frage**: Mockup im Chat, dann ins Portal | Frage 1 (Alter) fertig, Karriere-Frage 1 (Beschäftigung) im Bau | [Diagramm-Katalog](docs/DIAGRAMME.md) |
| 5 | **Portal (lokal)**: Admin + Hochschulsicht, Circle-Design, englische Oberfläche | läuft lokal, Demo-Accounts | `portal/`, [Portal-README](portal/README.md) |
| 6 | **KI-Interpretationen**: kurze Lesehilfe über den Diagrammen | Prototyp für den Beschäftigungs-Sankey | `portal/insights/` |
| 7 | **PDF-Reports pro Hochschule** | nur Konzept | `reports/`, [Architektur](docs/ARCHITEKTUR.md) |
| 8 | **Firebase-Migration**: Hosting, Auth, Firestore | Entwürfe, nichts deployt | `portal/firebase/`, `portal/docs/FIREBASE_MIGRATION.md` |
| 9 | **Datenschutz**: Echtdaten nie durch Claude Code | technisch abgesichert | [Data Governance](docs/data_governance.md) |
| 10 | **Längsschnitt (mehrere Wellen)** | Mock-Daten 2022–2025 für das Design | `data/processed/aggregates/waves_mock/` |

Was genau als Nächstes ansteht und was noch zu entscheiden ist: [Arbeitsstand](docs/ARBEITSSTAND.md).

## 3. In zwei Minuten loslegen

```bash
cd alumni_pulse_2026
bash scripts/setup.sh              # einmalig: Python-Umgebung, Portal-Pakete, Tests
npm --prefix portal run dev        # Portal starten -> http://localhost:5174
```

Direkt hineinschauen, ohne Login-Seite:

| Link | Ansicht |
|---|---|
| http://localhost:5174/demo/admin | Admin-Sicht (alle Hochschulen, Accounts freischalten) |
| http://localhost:5174/demo/S040/demographics | Hochschulsicht, Frage 1 (Alter) |
| http://localhost:5174/demo/ALL | Demo: alle Hochschulen gepoolt als „eine Hochschule“ |

Daten neu rechnen und testen:

```bash
.venv/bin/pytest                                 # alle Python-Tests
.venv/bin/python scripts/run_pipeline.py         # Rohdaten -> Kennzahlen pro Hochschule
.venv/bin/python scripts/synthetic/mock_waves.py # simulierte Vorjahreswellen
.venv/bin/python scripts/build_excel.py          # Excel-Mappe zum Durchblättern
```

Die Excel-Mappe `data/synthetic/Alumni_Pulse_2026_synthetic_dataset.xlsx` eignet sich am
besten, um sich die Daten ohne Programmierung anzusehen.

## 4. Drei Regeln, die immer gelten

1. **Keine Echtdaten in Claude Code.** Echte Qualtrics-Exporte liegen außerhalb des
   Projekts in `~/AlumniPulse_SecureData/` und werden nur von einem Menschen im eigenen
   Terminal verarbeitet. Ein Hook blockiert jeden Zugriff von Claude Code darauf.
   [Details](docs/data_governance.md)
2. **Jede Formel hat einen Unit-Test.** Bevor ein Diagramm oder Report als fertig gilt,
   laufen die Tests. Code ist Schritt für Schritt kommentiert.
3. **Kleine Zahlen schützen.** Hochschulwerte erst ab 10 Antworten, Benchmarks ab 8
   Hochschulen, und keine Zelle, die weniger als 3 Personen zeigt.

## 5. So arbeitest du am besten mit Claude Code weiter

Beispiele, die du direkt so eintippen kannst:

- „Starte das Portal und zeig mir die Hochschulsicht von S022.“
- „Erkläre mir, wie der NPS pro Hochschule berechnet wird, und rechne ihn für S004 nach.“
- „Mach mir zwei D3-Mockups zur Frage *pgm_satisfaction* im Chat.“ (Ablauf: [Diagramme](docs/DIAGRAMME.md))
- „Das zweite Mockup gefällt mir. Bau es ins Portal ein.“
- „Was ist der Unterschied zwischen dem Benchmark ‚Region‘ und ‚Tier‘?“

Hilfreiche Befehle: `/start` (Begrüßung und Überblick), `/portal` (Portal starten),
`/neues-diagramm` (Ablauf für ein neues Diagramm), `/pipeline` (Daten neu rechnen und prüfen).

## 6. Wo steht was?

| Dokument | Inhalt |
|---|---|
| [docs/ARBEITSSTAND.md](docs/ARBEITSSTAND.md) | Was ist fertig, was läuft, was ist offen, Entscheidungen |
| [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md) | Architektur heute (lokal) und künftig (Firebase, PDF, Echtdaten) |
| [docs/SYNTHETISCHE_DATEN.md](docs/SYNTHETISCHE_DATEN.md) | Wie die Testdaten entstehen und was sie (nicht) können |
| [docs/DIAGRAMME.md](docs/DIAGRAMME.md) | Alle Diagramme mit Status und der Ablauf für neue |
| [docs/data_governance.md](docs/data_governance.md) | Datenschutz-Architektur und Runbook für Echtdaten |
| [docs/design/](docs/design/) | Circle-Design-System (Farben, Schriften, Komponenten) |
| [qa/QA_report.md](qa/QA_report.md) | Unabhängige Qualitätsprüfung der synthetischen Daten |
| [portal/README.md](portal/README.md) | Portal: Start, Demo-Accounts, Aufbau, Datenmodell |
| [CLAUDE.md](CLAUDE.md) | Arbeitsregeln für Claude Code in diesem Projekt |

Viel Freude beim Weiterarbeiten!
