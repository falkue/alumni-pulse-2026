/**
 * KI-Texte zum Sankey "Employment status": Vollständigkeit, Schema und
 * Halluzinations-Schutz (jede Zahl muss aus den Eingaben der Hochschule stammen).
 * Einzelne Hochschule prüfen:  npx vitest run tests/insights -t S040
 */
import { readdirSync, readFileSync } from 'node:fs';
import { checkInsightNumbers, insightText, mapChartInsight } from '../../src/domain/insights';

const DIR = 'insights/career_employment/';
const ids = readdirSync(`${DIR}inputs/`).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const has = (id: string) => readdirSync(`${DIR}texts/`).includes(`${id}.json`);

describe('KI-Texte career_employment', () => {
  it('für jede Hochschule (inkl. ALL) gibt es einen Text', () => {
    expect(ids.filter((id) => !has(id))).toEqual([]);
  });

  it.each(ids)('%s: Schema, Länge, Kennzeichnung und nur belegte Zahlen', (id) => {
    if (!has(id)) return; // Vollständigkeit prüft der Test oben
    const raw = read(`${DIR}texts/${id}.json`);
    const inputs = read(`${DIR}inputs/${id}.json`);
    const i = mapChartInsight(raw);
    // Schema
    expect(i.schoolId).toBe(id);
    expect(i.chartId).toBe('career_employment_status');
    expect(raw.language).toBe('en');
    expect(i.headline.split(/\s+/).length).toBeLessThanOrEqual(18);
    expect(i.howToRead.length).toBeGreaterThan(40);
    expect(i.keyFindings.length).toBeGreaterThanOrEqual(inputs.published ? 2 : 0);
    expect(i.keyFindings.length).toBeLessThanOrEqual(3);
    expect(i.generatedBy.provider).toBe('Anthropic');
    expect(i.generatedBy.model).toMatch(/^claude-/);
    expect(Number.isNaN(Date.parse(i.generatedAt))).toBe(false);
    // Länge (~140 Wörter, etwas Toleranz)
    expect(insightText(i).split(/\s+/).length).toBeLessThanOrEqual(170);
    // keine anderen Hochschul-IDs/-Namen
    expect(insightText(i)).not.toMatch(/\bS\d{3}\b/);
    // Halluzinations-Schutz
    const check = checkInsightNumbers(insightText(i), inputs);
    expect(check.unknown).toEqual([]);
  });
});
