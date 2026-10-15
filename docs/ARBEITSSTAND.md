# Arbeitsstand (15. Oktober 2026)

Übergabestand des Projekts. Ergänze dieses Dokument, wenn sich etwas Wesentliches ändert.

## Fertig

**Grundlagen**
- Fragebogen (Qualtrics-Export, `Alumni_Survey_2026.docx`) in ein maschinenlesbares Codebook
  übersetzt: `codebook/codebook.yaml`, 221 Exportspalten inklusive Anzeige-Logik.
- Projektstruktur, die später unverändert für die Echtdaten gilt (Produktionsmodus mit
  sicherem Datenordner außerhalb des Projekts).
- Datenschutz-Architektur mit vier Schutzebenen: Speicherort, Deny-Regeln, Guard-Hook und
  Code-Prüfung (siehe `docs/data_governance.md`).

**Synthetische Daten (v2)**
- 50 fiktive Hochschulen, 1'688 Rohzeilen, 1'499 gültige Interviews, 3'915 Freitexte.
- Nach einer unabhängigen QA nachkalibriert (Seniorität, NPS-Spreizung, KI-Nutzung,
  Mehrfachauswahl, Geschlechter- und Abschlussmix). Vorher/Nachher in `qa/QA_report.md`.
- Excel-Mappe zum Durchblättern: `data/synthetic/Alumni_Pulse_2026_synthetic_dataset.xlsx`.

**Pipeline**
- Einlesen (Qualtrics-CSV mit drei Kopfzeilen), Bereinigung (Einwilligung, Screen-out,
  Abbruch, Duplikat, Bot, Speeder), abgeleitete Variablen (Alter, höchster Abschluss,
  Gehalt in Kaufkraft-Dollar, Skill-Gaps …), Kennzahlen pro Hochschule und pro
  Benchmark-Gruppe, anonyme Vergleichswerte, Kleinzellenschutz.
- Ein JSON pro Hochschule in `data/processed/aggregates/schools/` als Grundlage für Portal
  und künftige PDF-Reports. Zusätzlich die Demo-Sicht `ALL.json` (alle Hochschulen gepoolt).
- 103 Python-Unit-Tests, alle grün (`.venv/bin/pytest`).

**Portal (lokal)**
- Admin-Sicht: alle Hochschulen, Suche und Filter, Accounts freischalten, deaktivieren und
  einladen (Mock).
- Hochschulsicht mit Mandantentrennung. Fertige Auswertungen:
  - „Who answered?“ (Frage 1, Alter): Alterspyramide und Median-Alter im Vergleich mit
    Wellen-Regler 2022–2026.
  - „Career & salary“: Sankey „Employment status“ mit KI-Interpretation (in Arbeit, siehe unten).
- Design „Circle / PostPlan“ des Projektinhabers mit blauem Akzent, englische Oberfläche,
  Dark Mode, Handy-Ansicht.
- Demo-Zugänge (`/demo/...`) und Demo-Account „All participating schools (demo)“.
- Firebase-Entwürfe (Rules, Datenmodell, Migrationspfad), nichts deployt.

## In Arbeit (Stand der Übergabe)

| Thema | Stand | Nächster Schritt |
|---|---|---|
| Karriere-Frage 1: Sankey „Employment status“ im Portal | eingebaut; KI-Interpretationstexte pro Hochschule werden gerade fertig geschrieben und geprüft | im Browser mit S040, S002 und ALL prüfen (Ansicht wechseln über `/demo/...`) |
| Karriere-Frage 1: zweites Diagramm (Rektorssicht) | drei Iterationen im Chat: Beeswarm v1 (zu komplex), Beeswarm v2 (gefiel nicht), „Von 100 Alumni …“-Raster v3 (Feedback offen) | Entscheidung über v3; Referenz in `docs/DIAGRAMME.md` |

## Offen und zu entscheiden

**Methodik** (mit der Projektleitung abstimmen):
- Benchmark mit oder ohne die eigene Hochschule? Heute ist sie enthalten. Bei kleinen
  Gruppen (8 Hochschulen) verwischt das den Unterschied leicht.
- Gewichtung der Benchmarks: heute gepoolt über alle Befragten, große Hochschulen zählen
  also stärker. Alternative: jede Hochschule zählt gleich.
- Schwellen (`config/settings.yaml`): Hochschule ab 10 Antworten, Benchmark ab 8
  Hochschulen und 50 Antworten, Zellen ab 3 Personen. Die Pyramide ist dadurch bei 49 von
  50 Hochschulen lückenhaft. Option: auf Hochschulebene gröbere Altersgruppen.
- Unsicherheit bei kleinen Fallzahlen sichtbar machen (Konfidenz, „signifikant
  über/unter“) oder bewusst weglassen?

**Inhalt und Daten:**
- Labels mit PLACEHOLDER im Codebook (Branchen- und Funktionslisten) gegen die Live-Umfrage
  in Qualtrics prüfen.
- Echte Längsschnittdaten: Format pro Welle steht, Pipeline braucht dann einen Wellen-Parameter.
- Strukturdaten der Hochschulen (Alumni-Bestand nach Alter/Abschluss) für eine Gewichtung.

**Technik:**
- Firebase: Projekt, Region `europe-west6`, Login (E-Mail-Link / SWITCH edu-ID), Datenschutz
  zu Firebase Auth. Siehe `portal/docs/FIREBASE_MIGRATION.md`.
- PDF-Report pro Hochschule: Vorlage und Erzeugung (siehe `docs/ARCHITEKTUR.md`).
- Upload-Skript für die Aggregate nach Firestore (wird von einem Menschen ausgeführt).
- Ein Git-Repository fehlt noch. Empfehlung: `git init` und ein erster Commit, danach
  Änderungen über Commits nachvollziehen (die `.gitignore` schließt Daten und `.venv` aus).

## Entscheidungen bisher (Protokoll)

| Datum | Entscheidung |
|---|---|
| 15.10. | Synthetische Daten im exakten Qualtrics-Format, damit die Pipeline später unverändert läuft |
| 15.10. | Respondent-Ebene mit Hochschulen als Cluster (der Fragebogen richtet sich an Alumni, nicht an Hochschulen) |
| 15.10. | Echtdaten nie durch Claude Code; vier Schutzebenen |
| 15.10. | Arbeitsordner `~/Downloads/alumni_pulse_2026`, weil iCloud-Ordner Dateizugriffe blockieren |
| 15.10. | Jede Formel mit Unit-Test, Code Schritt für Schritt kommentiert |
| 15.10. | Kleinzellenschutz < 3 Personen inklusive Sekundärunterdrückung |
| 15.10. | Andere Hochschulen in der Kundensicht nur anonym (keine Namen) |
| 15.10. | Portal-Oberfläche auf Englisch, Doku und Chat auf Deutsch |
| 15.10. | Design-System „Circle / PostPlan“ mit blauem Akzent |
| 15.10. | Diagramme ausschließlich mit D3.js; Mockups zuerst im Chat, dann ins Portal |
| 15.10. | Demo-Sicht „ALL“ (alle Hochschulen gepoolt) nur im synthetischen Modus |
