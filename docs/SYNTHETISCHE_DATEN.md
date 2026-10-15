# Synthetische Daten

## Wozu

Die Feldphase hat noch nicht begonnen. Damit Pipeline, Diagramme, Portal und Reports schon
heute gebaut und getestet werden können, gibt es einen realistischen **Fake-Export**. Er
hat exakt das Format eines Qualtrics-Exports (numerische Werte, drei Kopfzeilen,
Exporttags als Spaltennamen). **Alle Hochschulen und Personen sind erfunden.** Die Zahlen
stammen aus einem Simulationsmodell und sind keine empirischen Befunde.

## Dateien (`data/synthetic/`)

| Datei | Inhalt |
|---|---|
| `alumni_pulse_2026_synthetic_qualtrics_with_texts.csv` | Rohexport mit Freitexten, 1'688 Zeilen (Eingabe der Pipeline) |
| `alumni_pulse_2026_synthetic_qualtrics.csv` | derselbe Export ohne Freitexte |
| `ground_truth.csv` | die „Wahrheit“: Fallart (gültig, Abbruch, Bot …), versteckte Merkmale, eingebaute Fehler |
| `open_answers_long.csv` | alle Freitexte im Langformat (ID, Feld, Sprache, Text) |
| `Alumni_Pulse_2026_synthetic_dataset.xlsx` | alles zum Durchblättern: Antworten mit Labels, Codes, Freitexte, KPIs, Codebook |

Referenzdaten: `data/reference/schools.csv` (50 Hochschulen mit Land, Typ, Akkreditierung,
Ranking-Tier, Abschlussmix) und `countries.csv` (Kaufkraft-Faktoren, Gehaltsniveaus).

## Wie die Daten entstehen

1. **Hochschulen**: 25 Europa, 10 Amerika (davon 7 USA), 15 Asien, mit fiktiven Namen.
   Jede hat verdeckte Eigenschaften: Qualität, Netzwerk und KI-Curriculum.
2. **Personen** (`scripts/synthetic/generate.py`): Jede simulierte Person hat zwei
   verdeckte Merkmale, Karriereerfolg und Grundstimmung. Alle Antworten entstehen aus diesen
   Merkmalen, den Hochschuleigenschaften und Zufallsrauschen. Daraus ergeben sich
   realistische Zusammenhänge: Gute Hochschulen haben einen höheren NPS, Senior-Positionen
   höhere Gehälter, und wer kürzlich abgeschlossen hat, ist besser auf KI vorbereitet.
   Regionale Antwortstile sind eingebaut (Japan und Korea antworten zurückhaltender,
   Indien und die USA positiver).
3. **Skip-Logik**: Jede Antwort respektiert die Anzeigebedingungen des Fragebogens. Ein Test
   beweist, dass der Generator keine einzige Antwort auf eine versteckte Frage erzeugt.
4. **Typische Problemfälle** für die Bereinigung: keine Einwilligung (1 %), Screen-outs (2 %),
   Abbrüche (7 %), Speeder (1,5 %), Bots (0,5 %), Duplikate (0,5 %) und Tippfehler beim
   Gehalt (Monats- statt Jahresgehalt, eine Null zu viel, in Tausend).
5. **Freitexte**: Sprachmodell-Agenten (Claude Haiku) schreiben pro Region die offenen
   Antworten passend zum Profil. Detraktoren klingen kritisch, Promotoren loben. Die Länge
   variiert, es gibt Nicht-Antworten, und etwa 10 % sind in der Landessprache. Prüfskript:
   `scripts/synthetic/check_text_chunk.py`.
6. **Kalibrierung**: Eine unabhängige QA hat Verteilungen gegen realistische Werte geprüft
   (`qa/QA_report.md`). Die Zielbereiche stehen in `scripts/synthetic/calibration.py`
   (`TARGETS`) und werden in `tests/test_generator.py` geprüft. Beispiele: C-Level-Anteil
   5–8 %, Standardabweichung des Schul-NPS unter 20, tägliche KI-Nutzung 30–35 %.

## Kennzahlen des aktuellen Datensatzes (v2)

1'499 gültige Interviews, Gesamt-NPS etwa +29, Schul-NPS zwischen −10 und +55, Median-Alter
34, 92,6 % beschäftigt, 30 % nutzen KI täglich, 3'915 Freitexte.

## Neu erzeugen

```bash
.venv/bin/python scripts/synthetic/generate.py      # Seed 2026, deterministisch
.venv/bin/python scripts/synthetic/merge_texts.py   # Freitexte einmischen
.venv/bin/python scripts/run_pipeline.py
.venv/bin/python scripts/synthetic/mock_waves.py
.venv/bin/python scripts/build_excel.py
```

**Achtung:** Sobald `generate.py` geändert wird, entstehen neue ResponseIds. Die Freitexte
passen dann nicht mehr und müssen neu geschrieben werden (Ablauf: Text-Requests in Chunks
teilen, je Chunk ein Haiku-Agent, Prüfung mit `check_text_chunk.py`). Die Vorversion liegt
unter `.work/archive_v1/`.

## Grenzen

- Die Labels der Branchen- und Funktionslisten sind Platzhalter (siehe Codebook).
- Kaufkraft-Faktoren und Gehaltsniveaus sind plausible Schätzungen, keine amtlichen Werte.
- Die Vorjahre 2022–2025 (`waves_mock/`) sind nur für das Design der Zeitreihen gedacht.
