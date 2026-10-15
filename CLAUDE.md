# Global Alumni Pulse 2026 — Anleitung für Claude Code

## Erste Sitzung: Pia Furchheim begrüßen

Dieses Projekt wurde an **Prof. Dr. Pia Furchheim** (ZHAW School of Management and Law,
wissenschaftliche Leitung der Studie) übergeben. Beginnt eine neue Sitzung und ist noch
unklar, wer arbeitet, oder schreibt jemand `/start`, „Hallo“ oder Ähnliches:

1. Begrüße Pia herzlich mit Namen und per Du (Ansprache in der zweiten Person).
2. Gib einen kurzen Überblick (höchstens etwa 15 Zeilen): worum es geht, die
   Entwicklungsstränge aus `START_HIER.md` (Abschnitt 2) und der aktuelle Stand aus
   `docs/ARBEITSSTAND.md`.
3. Biete konkrete Hilfe an, zum Beispiel: Einrichtung prüfen bzw. `bash scripts/setup.sh`,
   Portal starten (`/portal`) und die wichtigsten Ansichten zeigen, Daten und Berechnungen
   erklären, mit dem nächsten Diagramm weitermachen (`/neues-diagramm`) oder offene
   Entscheidungen durchgehen.
4. Sei kooperativ und geduldig. Beantworte Fragen ausführlich und verständlich, auch zu
   Statistik und Technik, und erkläre Fachbegriffe in Klartext. Wenn etwas unklar ist,
   frage nach, statt zu raten.

## HARTE REGEL: keine Echtdaten

Lies, durchsuche, liste, kopiere, bearbeite oder verarbeite niemals echte Befragungsdaten:
Qualtrics-Exporte, alles im sicheren Datenordner außerhalb des Projekts und den
Produktionsmodus. Arbeite nur mit `data/synthetic/`. Starte die Pipeline nie im
Produktionsmodus. Ein Guard-Hook setzt das durch; versuche nicht, ihn zu umgehen. Braucht
eine Aufgabe scheinbar Echtdaten, halte an und frag nach. Details: `docs/data_governance.md`.

## Arbeitsstil (bitte genau so fortführen)

- **Sprache:** Chat und Doku auf Deutsch, Code-Kommentare auf Englisch, Portal-Oberfläche
  auf Englisch.
- **Qualität:** Jede Formel und jedes Skript bekommt Unit-Tests mit von Hand nachgerechneten
  Erwartungswerten. Vor jeder Auslieferung von Diagrammen oder Reports laufen
  `.venv/bin/pytest` und `npm --prefix portal test`. Nur grün abgeben.
- **Verständlicher Code:** Schritt für Schritt kommentiert, Docstrings erklären das Warum.
- **Diagramme:** ausschließlich D3.js. Erst zwei Mockups im Chat aus den synthetischen
  Daten, dann nach Abnahme in Pipeline und Portal (Ablauf in `docs/DIAGRAMME.md`).
  Leitfrage: Versteht eine Rektorin das in zehn Sekunden?
- **Design:** Circle / PostPlan (`docs/design/`, Tokens in `portal/src/styles/tokens.css`),
  blauer Akzent, eigene Hochschule blau, andere grau und anonym.
- **Datenschutz in Auswertungen:** Hochschulwerte ab n ≥ 10, Benchmarks ab 8 Hochschulen,
  Kleinzellen < 3 Personen ausblenden (inklusive Sekundärunterdrückung,
  `pipeline/suppression.py`). Andere Hochschulen in der Kundensicht nie mit Namen zeigen.
- **Größere Aufgaben** gern mit einem Agenten-Team erledigen: Opus für Architektur und
  Statistik, Sonnet für Umsetzung und QA, Haiku für Fleißarbeit. Eine unabhängige
  QA-Prüfung hat sich bewährt.
- **Ehrlich berichten:** Ergebnisse selbst prüfen (Tests, Nachrechnen, Browser), bevor
  „fertig“ gemeldet wird.

## Projektaufbau

- `codebook/codebook.yaml`: alle Variablen und die Skip-Logik (Single Source of Truth)
- `pipeline/`: ingest, logic, clean, derive, metrics, aggregate, suppression, labels, environment
- `scripts/run_pipeline.py`: komplette Pipeline; `scripts/synthetic/`: Generator, Freitexte,
  Mock-Wellen (nur synthetisch)
- `config/settings.yaml`: alle methodischen Schwellen
- `portal/`: React/Vite-Portal (eigene README); `docs/`: Architektur, Arbeitsstand,
  Daten, Diagramme, Design
- `tests/`: Python-Tests; `portal/tests/`: Portal-Tests

## Umgebung

- Python-venv liegt außerhalb von iCloud/OneDrive (`~/.venvs/alumni_pulse_2026`,
  verlinkt als `.venv`); einrichten mit `bash scripts/setup.sh`.
- Portal starten: `npm --prefix portal run dev` → http://localhost:5174 (auch über
  `.claude/launch.json`, Eintrag `portal`, im Vorschau-Browser).
- Demo-Links ohne Login: `/demo/admin`, `/demo/S040`, `/demo/ALL`.
