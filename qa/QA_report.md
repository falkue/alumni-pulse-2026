# QA-Bericht: Global Alumni Pulse 2026 (synthetische Daten)

Prüfer: unabhängiges QA (eigene Skripte unter `.work/qa/`, nicht `pipeline.logic`). Datenbasis: 1.688 Rohfälle, 1.488 valide, 50 Schulen. Es wurden nur synthetische Daten verwendet.

## Gesamturteil: GELB (technisch grün, inhaltlich realistisch nachschärfen)
Pipeline, Formeln und Skip-Logik sind sauber (0 Verstöße, 0 Formelabweichungen, 48/48 Tests grün). Bereinigung fängt alle injizierten Problemfälle, kostet aber 12 echte Interviews. Gelb wegen (a) Salary-Typo-Erkennung nur 13/19, (b) mehreren unrealistisch glatten bzw. extremen Verteilungen im Generator, (c) kleineren Anonymitäts-/Metadaten-Punkten.

## Befunde

### Kritisch
Keine Blocker für die Pipeline. Für die Verwendung der Daten als Report-Testbasis gilt aber mittel-hoch: Punkt M1 (Seniorität) und M2 (Schul-NPS-Spreizung), weil Demo-Reports sonst unglaubwürdig wirken.

### Mittel
**M1 Zu viele Senior-Positionen.** C-Level/Board 18,9 %, Senior Management 13,7 % (zusammen 33 %) bei Medianalter 35. In der Altersgruppe 25-34 sind 11 %, bei 35-44 44 %, bei 45-54 61 % in Top-/Senior-Management. Real eher 5-8 % C-Level insgesamt. Folge: Gesamtmedian FTE-Gehalt 89.800 PPP-$, Altersgruppe 45-54 median 169.000. Generator: Schwellen `threshold_category(seniority, [0.9,1.6,2.4,3.0,3.6])` (Z. ~366) anheben (z. B. [1.2,2.2,3.2,4.0,4.8]) bzw. Faktor `1.2*log1p(years)` auf ca. 0,9 senken.

**M2 Schul-NPS zu stark gespreizt.** Schul-NPS Mittel 29, SD 30,9, Spanne -60 (S045, n=20) bis +76 (S016). Tier 1 Mittel +57,5, Tier 2 +26,9, Tier 3 +2,7; innerhalb Tier 3 SD 37 (Stichprobenrauschen bei n≈20 allein ca. 20). Zufriedenheit Top-2: Spanne 35 % bis 100 % (3 Schulen ≥95 %). Gesamt-NPS +34,4 ist plausibel. Generator: `1.0*Q` im `nps_latent` (Z. 468) auf ca. 0,5-0,6 senken, `tier_bonus` (Z. 254) halbieren; Zielspanne Schul-NPS ca. -10 bis +65.

**M3 NPS-Verteilung ohne linken Rand.** Keine einzige Antwort 0-2, nur 0,2 % Wert 3, 0,5 % Wert 4; Zufriedenheit 1 (sehr unzufrieden) 0,1 %, 2 nur 1,4 %. Real typisch 3-6 % bei 0-3. Korrelation NPS/Zufriedenheit 0,74 (real eher 0,5-0,65), NPS/Karrierezufriedenheit 0,21 plausibel. Generator: Rauschen `rng.normal(0,1.3)` auf 1,8-2,0 oder eine Mischkomponente (ca. 5 % Unzufriedene, Latent -3); Zufriedenheit mit stärkerem Eigenrauschen (0,45 -> 0,7).

**M4 Salary-Typo-Erkennung unvollständig.** Injiziert 19 (in_thousands 8, extra_zero 7, monthly 4): erkannt 13 (68 %): in_thousands 8/8, extra_zero 3/7, monthly 2/4. 6 bleiben im Median (z. B. 1,16 Mio. in FR, 1,01 Mio. in CH, 506 k in SG, 479 k in HK; monatlich 9.750 in US). 2 echte Gehälter fälschlich als Ausreißer. Ursache: robustes z je Land ohne Position-Kontrolle (Streuung der Logs durch Position ist groß; ×10 liefert nur z≈2,0-3,6). Test mit meinem Code: z je Land nach Position bereinigt (Residuum log-FTE minus Positions- und Landesmedian), Schwelle 4,0: 18/19 erkannt, 3 Fehlalarme (aktuell 13/19 bei 2). `salary_ppp_max` von 2.000.000 auf 1.000.000 bringt +2 ohne Fehlalarm. Empfehlung: `salary_ppp_max: 1000000` sofort; bereinigtes z (Position/Land) in `derive.salary_variables` als Erweiterung.

**M5 Speeder-Schwelle kostet echte Interviews.** Confusion (wahr -> Pipeline): bot 8/8, duplicate 8/8, no_consent 15/15, screen_out 30/30, partial 105 -> 101 incomplete + 4 screen_out (alle ausgeschlossen), speeder 22/22. False Positives: 12 von 1.500 wahren Valid (0,8 %) als speeder ausgeschlossen (Dauer 212-313 s, kein Straightlining, reCAPTCHA 0,73-0,97). Alle 22 echten Speeder sind zugleich Straightliner (37-49 identische Items, Dauer 152-277 s) und werden von der Regel `flat_and_fast` allein gefangen. Sensitivität `speeder_share_of_median` (Median 949 s): 0,20 -> 22/22, 0 FP; 0,25 -> 22/22, 3 FP; 0,33 (aktuell) -> 22/22, 12 FP; 0,40 -> 28 FP. Empfehlung: auf 0,20-0,25 senken (synthetisch kalibriert). Bei echten Daten reine Dauerfälle zwischen 0,20 und 0,33 nur markieren (Review), nicht automatisch ausschließen. Bot-Schwelle 0,5 ist sauber (Bots 0,10-0,39, Valid ≥0,70).

**M6 Gehaltsniveaus je Land teils unplausibel.** Median FTE / Landesreferenz (`salary_level_ppp_usd`): Spanien 1,67 (96.700 > Deutschland 88.000), Italien 1,61, Frankreich 1,47, Indien 1,29, Schweiz/Luxemburg ~1,25. Gegenläufig Indonesien 0,80, Mexiko 0,81. Länder mit n<15 (ID 18, VN 11, LU 6, AU 11, IE 14) sind instabil. Hängt mit M1 zusammen; zusätzlich Spanien/Italien/Frankreich-Referenzniveaus prüfen. Geschlechterlücke Median 81.000 (w) vs. 96.800 (m) = -16 % wirkt plausibel.

**M7 KI-Nutzung am oberen Rand.** Täglich 43,7 % (Asien 56 %, Europa 38 %, Amerika 39 %, unter 25: 57 %), nie nur 3,6 %. Agentic: nur 4,2 % "nie gehört", 69 % "experimentieren oder mehr", 24 % regelmäßig, 8,4 % "Kern-Workflow". Für 2026 denkbar, aber eher optimistisch für Alumni-Gesamtheit; "Kern-Workflow" 8,4 % ist hoch. Generator: Schwellen `threshold_category(a,[-1.5,-0.9,-0.4,0.6])` (Z. ~513) nach oben (z. B. [-1.2,-0.4,0.3,1.2]) und Agentic-Schwellen `[-1.3,0.2,1.3,2.3]` -> `[-0.9,0.6,1.7,2.7]`; Ziel täglich ca. 30-35 %, regelmäßig+Kern ca. 15-20 %.

**M8 Mehrfachauswahl "bis zu 3" zu uniform.** Genau 3 Nennungen: out_soc_chall 82,9 %, out_econ_chall 85,4 %, ai_skill_need 78,2 % (real mehr 1-2er). Generator: Anzahl Nennungen zufällig 1-3 ziehen statt immer Maximum.

**M9 Anonymität/Metadaten.**
(a) `school_kpis.csv` enthält alle 50 Schulen mit Namen und KPI in einer Datei und wird mit `min_n_cell=5` statt `min_n_school=10` berechnet; bei echten Daten würden Schulen mit n 5-9 dort Werte zeigen, obwohl das Profil unterdrückt wird. Intern halten und `min_n_school` anwenden.
(b) Schul-JSON enthält die Latent-Effekte nicht (geprüft: kein `quality_effect`, `network_effect`, `ai_curriculum_effect`, keine ResponseIds, keine E-Mails, keine Latent-/Ground-Truth-Felder). Aber `school` enthält die Generator-Parameter `share_bachelor/master/mba/emba/phd`, `n_respondents` (Soll-Stichprobe, stimmt bei 20 % der Schulen nicht mit tatsächlichem n überein), `notes`, `equis`, `alumni_base_size`. Empfohlen: Whitelist statt Blacklist in `aggregate.py`.
(c) `min_n_cell=5` ist niedrig: Anteile auf Basis 12 Befragter (z. B. `ai.agentic_task_*` für S004: 58,3 %) und 17-stufige Positionsverteilung bei n=25 sind reines Rauschen. Empfehlung `min_n_cell: 10` für Verteilungen/Teilgruppen.

### Gering
- G1 `career.salary_disclosed.share` hat als Basis alle Befragten (87,0 %) statt nur Erwerbstätige (86,0 %); Frage wird nur Erwerbstätigen gestellt.
- G2 Rundung: S008 `skills.ai.gap` 1,775 -> 1,77 (Float-Rundung), sonst 99/100 Vergleiche exakt.
- G3 5 Befragte mit Abschlussalter <20 (min. 18); 11 Befragte ab 70, max. 88 Jahre; 3,2 % unter 25.
- G4 Geschlecht regional praktisch identisch (w 39-41 %), Abschlussmix regional identisch: zu uniform. Frauenanteil sollte nach Region/Hochschultyp streuen (z. B. Asien/Nahost niedriger bzw. MBA-Schulen 35-45 %).
- G5 Beschäftigungsquote 92 % (Selbständige 8,6 %, Rentner 1,2 %, nicht erwerbstätig 6,5 %): okay.
- G6 Die Abschlüsse je Schultyp sind sinnvoll (FH 56 % Bachelor, Business Schools 30 % MBA).

## Prüfung der Einzelpunkte
- **Skip-Logik (unabhängig, ~40 Regeln, 0 Verstöße):** Gehalt nur Erwerbstätige; job_type/job_status; Workload nur Teilzeit/Selbständig (und nie fehlend); Rentenjahr nur Rentner; Funktion nur Position 1-8; Skill-Preparation nur bei Importance>=3 (und nie fehlend, 4 Skills geprüft); ai_task/agentic/headcount nur ai_use_freq!=1 (und nie leer); agentic_task nur bei agentic 3-5; ai_barrier nie bei täglicher Nutzung, Option 1/8/2 nur bei passenden Bedingungen; max. 3 und Exklusiv-Optionen (19, 20, 15, 8/9); ai_access_6 nur bei laufendem Abschluss; Student nur bei Bachelor in Ausbildung; Text-Felder nur bei passender Auswahl; nie Gehalt und "keine Angabe" gleichzeitig.
- **Formeln (3 Schulen, je Region: S004 Europa, S029 Amerika, S039 Asien):** NPS 3,8 / 43,8 / 68,3; Zufriedenheit Top-2 76,9 / 87,5 / 97,6; Median FTE-PPP 117.065 / 84.737 / 99.728,5; KI täglich 30,8 / 53,1 / 39,0; KI-Gap 2,00 / 1,41 / 1,68 stimmen exakt mit Schul-JSON und KPI-Tabelle überein. NPS und KI-Gap zusätzlich für alle 50 Schulen: nur Rundungsfall G2.
- **Benchmarks:** min_schools_benchmark=5 und min_n_benchmark=50 eingehalten; `applied_sciences_university` (2 Schulen, n=48) korrekt unterdrückt (`published: false`, `metrics: null`); kleinste veröffentlichte Gruppe 13 Schulen/256 n. `min_n_school=10` nicht testbar, da alle Schulen n>=18 (Regel nur per Unit-Test absichern). Hinweis: Eine Gruppe mit nur 5 Schulen ließe Rückrechnung auf Mitbewerber zu; Empfehlung 8+.
- **Tests:** `.venv/bin/pytest -q` -> 48 passed in 5,8 s.

## Offene Texte (3.825 Antworten, 60 gesichtet plus Mustersuche)
- Realismus gut: konkrete, berufs- und länderbezogene Aussagen, passend zu Position und Branche; Karrierezufriedenheits-Texte passen im Einstieg exakt zur Skala (z. B. "Very satisfied" nur bei 5; "Dissatisfied" nur bei 2; "Neither" nur bei 3).
- Keine E-Mails, URLs, Telefonnummern; keine realen Hochschulen oder Firmen (Treffer nur Städte wie Tokyo, Seoul, Rotterdam). Schulnamen sind fiktiv, wobei "Great Lakes", "Pearl River" an reale Namen anklingen.
- Sprachmix: 94,8 % Englisch, 63 de, 34 fr, 24 zh, je 15 es/it, 14 ja usw.; Fremdsprache nur in Heimatland der Schule und nur ca. 10 % dort; Mexiko/Brasilien/Thailand/Vietnam/Hongkong praktisch nur Englisch (kein pt/es). Hohe Länge-Homogenität: Ø 15,8 Wörter (SD 3,9), keine Tippfehler, keine Antworten wie "n/a", "-", Ein-Wort-Antworten (<1 %).
- Repetitiv: "Neither satisfied nor dissatisfied." 20x, "Neither here nor there." 13x, "Schools should teach how..." 11x; Textanteile sind unabhängig vom NPS (Mittelwert 8,2 in jedem Feld, 12 % Detraktoren): negative Tonalität in "change one thing" nicht an NPS gekoppelt.
- 28 Texte (0,7 %) gehören zu nicht-validen Responses (Speeder etc.): vor Textanalyse auf valide Fälle filtern.

## Empfehlungen (Reihenfolge)
1. `settings.yaml`: `speeder_share_of_median: 0.25` (oder 0.20), `salary_ppp_max: 1000000`, `min_n_cell: 10`; optional `salary_robust_z_max` auf bereinigtes z umstellen.
2. `aggregate.py`: Whitelist für `school`-Block; `school_kpis.csv` mit `min_n_school` maskieren.
3. Generator (M1, M2, M3, M7, M8, G4) anpassen und danach QA-Zahlen oben erneut prüfen; Test auf Zielbereiche ergänzen (z. B. C-Level-Anteil < 10 %, Schul-NPS-SD < 20).
4. Text-Generator: mehr Kurz-/Unsinn-Antworten, Tonalität an NPS koppeln, Phrasen-Wiederholungen begrenzen, pt/es für Brasilien/Mexiko.

## Umsetzung (Orchestrator, 15.10.2026)
- Umgesetzt: `speeder_share_of_median` 0.25 (jetzt 3 statt 12 Fehlausschlüsse, 1.497 valide), `salary_ppp_max` 1.000.000, `min_n_cell` 10, `min_schools_benchmark` 8; Whitelist für den `school`-Block; `school_kpis.csv` maskiert mit `min_n_school`; Basis von `career.salary_disclosed.share` = Erwerbstätige (G1). Neue Tests: `tests/test_aggregate.py`; 51/51 grün.
- Offen (eigener Folgeschritt, da Neugenerierung neue ResponseIds erzeugt und die Freitexte neu geschrieben werden müssen): Generator-Kalibrierung M1, M2, M3, M7, M8, G4, Länder-Gehaltsniveaus M6, positionsbereinigtes Gehalts-z (M4), Freitext-Realismus.

## Nachtrag: Generator-Kalibrierung und Neugenerierung (15.10.2026)

Grundlage: Datenset neu erzeugt (Seed 2026, 1.688 Rohfälle, **1.499 valide**), Freitexte neu geschrieben (9 Haiku-Agenten, **3.915 Antworten**), Pipeline und Excel neu gebaut. Nur synthetische Daten. Messung reproduzierbar mit `.venv/bin/python scripts/synthetic/calibration.py` (Kennzahlen der Validen); die Zielbereiche stehen in `calibration.TARGETS` und werden in `tests/test_generator.py` am vollen 50-Schulen-Lauf geprüft. Tests: **86/86 grün** (vorher 51).

### Vorher/nachher (valide Fälle)

| Befund | Kennzahl | vorher | nachher | Ziel |
|---|---|---|---|---|
| M1 | C-Level/Board | 18,8 % | **6,6 %** | 5–8 % |
| M1 | Senior Management | 13,7 % | 9,5 % | – (Pyramide C < Senior < Middle 19 %) |
| M1 | Top+Senior, Alter 35–44 / 45–54 | 44 % / 61 % | 22 % / 36 % | – |
| M1 | Median FTE-Gehalt (PPP-$), 45–54 | 169.000 | 128.000 | – |
| M2 | Schul-NPS SD | 30,8 | **16,7** | < 20 |
| M2 | Schul-NPS Spanne | −60 … +77 | **−10 … +55** | ca. −10 … +65 |
| M2 | Tier 1 / 2 / 3 (Mittel) | +58 / +27 / +3 | +42 / +22 / +14 | – |
| M2 | Gesamt-NPS | +34,5 | +28,6 | plausibel 20–40 |
| M3 | NPS 0–3 | 0,2 % | **3,8 %** | 3–6 % |
| M3 | Zufriedenheit 1–2 | 1,5 % | 11,7 % | – |
| M3 | r(NPS, Zufriedenheit) | 0,74 | **0,64** | 0,50–0,65 |
| M7 | KI täglich | 43,8 % | **30,1 %** (EU 24, AM 31, AS 40) | 30–35 % |
| M7 | KI nie | 3,5 % | 6,3 % | – |
| M7 | Agentic regelmäßig + Kern | 32,7 % | **18,8 %** (Kern 4,1 %) | 15–20 % |
| M8 | genau 3 Nennungen (soc / econ / skill) | 83 / 85 / 78 % | **41 / 41 / 44 %** | ≤ 65 % |
| G4 | Frauenanteil EU / AM / AS | 41 / 38 / 40 % | **45 / 42 / 36 %** | streuen |
| G4 | MBA als höchster Abschluss EU / AM / AS | ~19 % überall | **17 / 29 / 16 %** | streuen |
| M4 | Gehalts-Tippfehler erkannt / Fehlalarme | 13/19 / 2 | **16/17 / 0** | – |

### Umsetzung je Befund
- **M1** `generate.py`: `SENIORITY_YEARS_FACTOR` 1,2 → 0,9, `SENIORITY_CUTS` [0,9; 1,6; 2,4; 3,0; 3,6] → [0,8; 1,5; 2,15; 2,85; 3,45]. Die Bericht-Schwellen [1,2; 2,2; 3,2; 4,0; 4,8] ergaben nur 1 % C-Level, deshalb nachjustiert; Ergebnis ist eine Pyramide (C 6,6 < Senior 9,5 < Middle 19 %).
- **M2** `TIER_BONUS` halbiert (0,15/0/−0,1), NPS-Gewicht der Schulqualität 1,0 → 0,35, Antwortstil 2,0 → 1,0, Basis 7,9 → 8,4 (hält Gesamt-NPS bei ca. +30). Bei n≈20–40 je Schule bleibt Stichprobenrauschen von ca. 12–15 Punkten; ein zweiter Seed (7) lag bei SD 19,9, also knapp im Ziel.
- **M3** Rauschen 1,3 → 1,7, Mischkomponente: 6,5 % Enttäuschte mit Latent −5,5; Zufriedenheit mit eigenem Rauschen 0,45 → 1,05.
- **M7** `AI_FREQ_CUTS` [−1,2; −0,4; 0,3; 1,05], `AGENTIC_CUTS` [−0,9; 0,6; 1,7; 2,7] (wie vorgeschlagen, oberste KI-Schwelle leicht gesenkt).
- **M8** `n_mentions_up_to_3()`: 1/2/3 Nennungen mit 22/36/42 %, für Herausforderungen und KI-Skill-Bedarf.
- **G4** `DEGREE_TILT` (Amerika mehr MBA, Europa mehr Master, Asien mehr Master/EMBA), `female_probability()`: Region (EU 47, AM 45, AS 36 %) + Abschluss (MBA −6, EMBA −12 Pp.) + Schuleffekt (SD 4 Pp.). Nach Schultyp: FH 42, Business School 41, Uni 43 %.
- **M6** `countries.csv` geprüft und **nicht geändert**: Die Referenzniveaus stehen im Verhältnis zu Deutschland (ES 0,68, IT 0,73, FR 0,85) im Rahmen der OECD-Lohnrelationen. Die Überhöhung kam aus M1 und aus der Zusammensetzung (ES/IT-Alumni stammen fast nur aus Elite-Business-Schools mit hohem MBA-Anteil). Nachher: Median FTE ES 62.500 < IT 68.900 < FR 71.200 < DE 86.700; Verhältnis zur Referenz ES 1,08, IT 1,11, FR 0,99 (vorher 1,67 / 1,61 / 1,47). Auffällig bleiben Japan 1,23 und Belgien 1,33 (n=17). Geschlechterlücke Median FTE −12 % (73.000 w vs. 83.000 m).
- **M4** `pipeline/derive.py`: `position_adjusted_log_salary()` rechnet das robuste z zuerst innerhalb der Position (eigene Streuung der Position, Positionen mit < 20 Gehältern gepoolt) und danach innerhalb des Landes. `settings.yaml`: `salary_z_adjust_position: true`, `salary_robust_z_max: 4.0`. Ohne Positions-eigene Streuung gab es 7 Fehlalarme (alles Selbständige), ohne Pooling Fehlalarme bei kleinen Akademikergruppen; beides ist abgefangen und getestet. Nicht erkannt bleibt 1 Monatsgehalt eines Teilzeitfalls in der Hochschulverwaltung (Irland, z = −3,6). Gegenprobe mit dem alten Datenset: 19/19 erkannt, 5 Fehlalarme (alte Regel 15/19, 2).
- Bereinigung unverändert sauber: bot 8/8, duplicate 8/8, no_consent 15/15, screen_out 30/30, speeder 22/22; 1 echter Fall als Speeder ausgeschlossen (0,07 %); 0 Logikverstöße.

### Freitexte (3.915 Antworten, 1.364 Befragte)
Die Text-Requests enthalten jetzt `tone` (aus dem NPS: 0–3 sehr negativ, 4–6 kritisch, 7–8 gemischt, 9–10 positiv) und je Feld einen Stil (`non_answer` 6 %, `very_short` 20 %, `normal` 58 %, `long` 16 %). Der Lokalsprachen-Anteil liegt für Mexiko bei 35 % und für Brasilien bei 40 %. `check_text_chunk.py` lässt jetzt Kurzantworten wiederholt zu und lehnt Antworten ab, die mit denselben vier Wörtern beginnen (max. 3 je Feld und Chunk).

| Kennzahl | vorher | nachher |
|---|---|---|
| Wörter je Antwort Ø (SD) | 15,9 (3,7) | 28,9 (24,8) |
| Antworten ≤ 3 Wörter (inkl. "n/a", "-", "no idea", "dunno") | 0,3 % | 17,0 % |
| Nicht-Englisch gesamt | 5,2 % | 6,4 % |
| Nicht-Englisch Mexiko / Brasilien | 0 % / 0 % | 41 % (es) / 39 % (pt) |
| Negativ-Marker in Schul-Feldern (en): Detraktoren / Promotoren | 2,0 % / 0,5 % | 6,2 % / 0,8 % |
| Häufigster Satzanfang je Feld (über alle Chunks) | 21× | 15× ("Business schools should be …", 561 Antworten) |

Die Tonalität ist jetzt an den NPS gekoppelt. Der Negativ-Marker ist nur ein grober Wortlisten-Proxy, deshalb zählt das Verhältnis 8:1 und nicht das absolute Niveau. Die Wiederholungsprüfung wirkt nur innerhalb eines Chunks; über alle Chunks bleiben gängige Einstiege wie "Business schools should …" bei der Frage nach der Rolle der Business Schools erhalten. Das ist realistisch. Gegenüber vorher hat sich die Länge stark geändert (Ø fast doppelt so lang, viel breitere Streuung). In der Stichprobe gibt es keine E-Mails, URLs oder Telefonnummern.

### Offen / Hinweise
- `school_nps_sd` < 20 hängt bei n≈30 je Schule auch vom Zufall ab (Seed 7: 19,9); bei neuen Seeds den Test beachten.
- Zufriedenheit 1–2 liegt jetzt bei 11,7 %. Das ist eher am oberen Rand (real eher 5–10 %); sie kann bei Bedarf über `SATISFACTION_NOISE_SD` gesenkt werden.
- Das Altdatenset und die alten Texte liegen unter `.work/archive_v1/`.
