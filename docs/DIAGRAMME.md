# Diagramme: Katalog und Arbeitsablauf

Alle Diagramme werden **ausschließlich mit D3.js** gebaut (inklusive D3-Erweiterungen wie
d3-sankey) und folgen dem Circle-Design (`docs/design/`).

## Katalog

| Frage / Abschnitt | Diagramm | Status | Wo |
|---|---|---|---|
| Frage 1 `dem_birth_year` (Alter) | Alterspyramide: eigene Hochschule gegen wählbaren Benchmark, Kleinzellen „< 3“ schraffiert | **im Portal** | `portal/src/ui/school/demographics/` · Spez. `docs/mockups/q1_age_charts_spec.md` |
| Frage 1 `dem_birth_year` | Median-Alter gegen anonyme Peers (Punktdiagramm) mit Wellen-Regler 2022–2026 und Trendlinie | **im Portal** (Vorjahre simuliert) | dto. · Referenz `docs/mockups/q1_age_benchmark_longitudinal_reference.html` |
| Karriere Frage 1 `job_employed` + Folgefragen | Sankey „Employment status“ (Befragte → beschäftigt/nicht → Art), Vergleich Your school / Region / All | **im Portal** mit KI-Interpretation (Abnahme im Browser offen) | `portal/src/ui/school/career/` · Referenz `docs/mockups/career_q1_sankey_reference.html` |
| Karriere Frage 1 | Rektorssicht v1: Beeswarm aller Hochschulen nach Region mit Konfidenzband und Mix-Balken | verworfen („zu komplex“) | nur im Chat |
| Karriere Frage 1 | Rektorssicht v2: Klartext-Satz und Ampel, einspuriger Beeswarm, Hantel-Zeilen „woran liegt’s“ | verworfen („gefällt nicht“) | nur im Chat |
| Karriere Frage 1 | Rektorssicht v3: „Von 100 Alumni …“, zwei 10×10-Raster eigene Hochschule gegen Vergleichsgruppe | **Feedback offen** | nur im Chat; auf Wunsch neu erzeugen |
| alle übrigen Abschnitte (Programmbewertung & NPS, Gehalt, Wellbeing, KI-Schwerpunkt, Benchmark) | – | Platzhalter im Portal | `portal/src/ui/school/sections.ts` |

**Was beim Projektinhaber gut ankam:** klare Vergleichslogik (eigene Hochschule blau,
andere grau und anonym), Zeitregler mit Play-Taste, Flussdiagramme. **Was nicht ankam:**
zu viele Kodierungen auf einmal (Größe, Farbe, Spur, Konfidenz) und statistische
Fachbegriffe ohne Klartext. Leitfrage für Hochschul-Diagramme: *Versteht eine Rektorin
das in zehn Sekunden?*

## Ablauf für ein neues Diagramm

1. **Frage wählen** und im Codebook nachsehen (`codebook/codebook.yaml`): Codes, Anzeige-Logik, Basis.
2. **Zwei Mockups im Chat**: Claude berechnet die Werte aus den synthetischen Daten und
   zeigt zwei unterschiedliche D3-Varianten direkt im Chat. Iterieren, bis eine gefällt.
3. **Kennzahl in die Pipeline**: Die Berechnung kommt in `pipeline/aggregate.py` (bzw.
   `metrics.py`), mit Kleinzellenschutz wo nötig (`pipeline/suppression.py`) und **mit
   Unit-Test**, dessen erwartete Werte von Hand nachgerechnet sind. Danach
   `scripts/run_pipeline.py` laufen lassen.
4. **Spezifikation und Referenz** in `docs/mockups/` ablegen: Datenquelle (JSON-Schlüssel),
   Verhalten, Anonymität, Sonderfälle wie ausgeblendete Zellen oder die Demo-Sicht ALL.
5. **Ins Portal einbauen**: Daten-Mapping als reine Funktion in `portal/src/domain/` mit
   Tests, Komponente in `portal/src/ui/school/<bereich>/`, Farben nur über Tokens.
   Oberfläche auf Englisch.
6. **Prüfen**: `.venv/bin/pytest`, `npm --prefix portal test`, dann im Browser mit
   mindestens drei Hochschulen (eine kleine mit vielen ausgeblendeten Zellen wie S040, eine
   große wie S002, und ALL), auf Desktop, Handy und im Dark Mode. Zahlen stichprobenartig
   gegen das JSON nachrechnen.
7. **Katalog oben aktualisieren.**

Der Befehl `/neues-diagramm` in Claude Code führt durch diesen Ablauf.
