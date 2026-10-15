# Global Alumni Pulse 2026: Auswertung, Portal und Reports

Auswertungsprojekt zur weltweiten Alumni-Befragung von Business Schools (ZHAW School of
Management and Law mit Financial Times, AACSB International und Beta Gamma Sigma).

**Neu hier? → [START_HIER.md](START_HIER.md)**

> Alle Daten in diesem Repository sind **synthetisch**: erfundene Hochschulen und
> Personen, simuliert für Entwicklung und Tests. Echte Befragungsdaten gehören nie in dieses
> Repository (siehe [docs/data_governance.md](docs/data_governance.md)).

## Stand (15. Oktober 2026)

- Synthetischer Datensatz: 50 fiktive Hochschulen (25 Europa, 10 Amerika, 15 Asien),
  1'688 Rohzeilen, 1'499 gültige Interviews, 3'915 Freitexte (nach QA nachkalibriert).
- Pipeline mit Bereinigung, Kennzahlen, Benchmarks und Kleinzellenschutz (103 Python-Tests).
- Lokales Portal mit Admin- und Hochschulsicht, Circle-Design, D3-Diagrammen (380 Portal-Tests).
- PDF-Reports und Firebase: Konzept bzw. Entwürfe. Details in [docs/ARBEITSSTAND.md](docs/ARBEITSSTAND.md).

## Inhalt

| Ordner | Inhalt |
|---|---|
| `codebook/` | Codebook: alle Variablen, Codes und die Skip-Logik des Fragebogens |
| `config/` | methodische Schwellen (Speeder, Gehalts-Ausreißer, Mindestfallzahlen) |
| `pipeline/` | Python-Pipeline: Einlesen, Bereinigen, Ableiten, Kennzahlen, Benchmarks, Kleinzellenschutz |
| `scripts/` | Pipeline-Lauf, Excel-Export, Setup; `synthetic/`: Datengenerator und Freitexte |
| `data/` | Referenzdaten (Hochschulen, Länder), synthetische Rohdaten, Kennzahlen pro Hochschule |
| `portal/` | lokales Web-Portal (React, D3.js), Firebase-portierbar |
| `docs/` | Arbeitsstand, Architektur, Daten, Diagramme, Design, Datenschutz |
| `qa/` | Qualitätsprüfung der synthetischen Daten |
| `tests/` | Unit-Tests der Pipeline |

## Schnellstart

```bash
bash scripts/setup.sh              # Python-Umgebung, Portal-Pakete, Tests
npm --prefix portal run dev        # Portal: http://localhost:5174/demo/admin
.venv/bin/pytest                   # Python-Tests
.venv/bin/python scripts/run_pipeline.py
```

Voraussetzungen: Python 3.12 (am besten mit [uv](https://docs.astral.sh/uv/)) und
Node.js ≥ 20. Der Ordner sollte **nicht** in iCloud oder OneDrive liegen, weil dort
synchronisierte Dateien Zugriffe blockieren.

## Weiterarbeiten mit Claude Code

Den Ordner in Claude Code öffnen und `/start` eingeben. Die Arbeitsregeln für Claude stehen
in [CLAUDE.md](CLAUDE.md), Befehle in `.claude/commands/`. Ein Guard-Hook
(`.claude/hooks/`) verhindert, dass Claude Code jemals auf Echtdaten zugreift.
