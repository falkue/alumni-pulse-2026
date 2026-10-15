export function mapSchool(r: Record<string, string>): Record<string, unknown>;
export function buildUsers(schools: { schoolId: string; shortName: string }[]): Record<string, unknown>[];
export const DEMO_ALL_ID: string;
export function buildDemoSchool(schools: { nRespondents: number }[]): Record<string, unknown>;
