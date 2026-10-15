---
description: Synthetische Daten neu rechnen und alles prüfen
---
Nur im synthetischen Modus: Führe `.venv/bin/pytest` aus, dann `scripts/run_pipeline.py`, `scripts/synthetic/mock_waves.py` und `scripts/build_excel.py`. Fasse die Ergebnisse zusammen (Anzahl gültiger Fälle, Ausschlüsse, Logikverstöße, unterdrückte Benchmark-Gruppen aus qa/pipeline_summary.json) und führe danach `npm --prefix portal test` aus. Melde ehrlich, falls etwas fehlschlägt. $ARGUMENTS
