/**
 * Bereichs-Definitionen der Hochschul-Sicht als Daten.
 * Neuer Bereich = ein Eintrag mehr; Navigation und Seiten entstehen automatisch.
 */
export interface PlannedCard {
  title: string;
  description?: string;
}

export interface SchoolSection {
  /** URL-Segment: /school/<id> */
  id: string;
  title: string;
  description: string;
  cards: PlannedCard[];
  /** Hinweis zur Mindestfallzahl (Benchmark) */
  minCellNote?: string;
  /** Spezialseite mit Report-Download */
  pdfReport?: boolean;
  /** Wort im Titel, das in der Serif-Überschrift blau hervorgehoben wird (Circle-Stil) */
  accent?: string;
  /** Bereich mit echter Auswertung statt Platzhalter-Karten (siehe SchoolSectionPage) */
  view?: 'demographics' | 'career';
}

/**
 * Alle Bereiche der Hochschul-Sicht in Anzeigereihenfolge.
 * Die ids overview, program_nps, career_salary, wellbeing_outlook und ai_focus entsprechen den
 * Firestore-sectionIds in docs/DATA_MODEL.md; benchmark und pdf-report sind reine UI-Bereiche.
 */
export const SCHOOL_SECTIONS: SchoolSection[] = [
  {
    id: 'overview',
    title: 'Overview / KPIs',
    accent: 'Overview',
    description: 'The key figures for your alumni at a glance.',
    cards: [
      { title: 'Response & sample', description: 'Number of respondents, response rate' },
      { title: 'Overall satisfaction' },
      { title: 'Net Promoter Score (NPS)' },
      { title: 'Respondent profile', description: 'Graduation year, programme, industry' },
    ],
  },
  {
    id: 'demographics',
    title: 'Who responded?',
    accent: 'responded',
    description: 'Age and gender of your respondents compared with other institutions (question 1).',
    view: 'demographics',
    cards: [],
  },
  {
    id: 'program_nps',
    title: 'Programme rating & NPS',
    accent: 'rating',
    description: 'How do alumni rate their programme, and would they recommend it?',
    cards: [
      { title: 'Programme quality by dimension' },
      { title: 'NPS by programme' },
      { title: 'Strengths and areas for improvement' },
    ],
  },
  {
    id: 'career_salary',
    title: 'Career & salary',
    accent: 'salary',
    view: 'career',
    description: 'Career paths, positions and compensation of alumni.',
    cards: [
      { title: 'Salary development' },
      { title: 'Career levels & positions' },
      { title: 'Industries and functions' },
    ],
  },
  {
    id: 'wellbeing_outlook',
    title: 'Wellbeing & Outlook',
    accent: 'Outlook',
    description: 'Alumni wellbeing and expectations for the future.',
    cards: [
      { title: 'Wellbeing index' },
      { title: 'Work-life balance' },
      { title: 'Career and labour market outlook' },
    ],
  },
  {
    id: 'ai_focus',
    title: 'AI focus',
    accent: 'focus',
    description: 'Use and assessment of AI in everyday work.',
    cards: [
      { title: 'AI use at work' },
      { title: 'Desired AI skills' },
      { title: 'Expected impact on careers' },
    ],
  },
  {
    id: 'benchmark',
    title: 'Benchmark',
    accent: 'Benchmark',
    description: 'Your institution compared with peer groups.',
    cards: [
      { title: 'Comparison by region' },
      { title: 'Comparison by institution type' },
      { title: 'Position in the overall field' },
    ],
    minCellNote:
      'Peer groups are shown only above a minimum case count, so that no conclusions can be drawn about individuals.',
  },
  {
    id: 'pdf-report',
    title: 'PDF report',
    accent: 'report',
    description: 'The full report for your institution, available to download.',
    cards: [],
    pdfReport: true,
  },
];
