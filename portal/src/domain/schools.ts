/**
 * Reine Funktionen rund um Hochschulen und ihren Zugangsstatus (Admin-Liste).
 */
import type { School, SchoolAccessStatus, SchoolFilter, UserAccount } from './types';

/**
 * Leitet den Zugangsstatus einer Hochschule aus ihren Accounts ab.
 * Alle active -> 'active'; mindestens einer active -> 'partial'; sonst 'none'.
 */
export function schoolAccessStatus(accounts: UserAccount[]): SchoolAccessStatus {
  if (accounts.length === 0) return 'none';
  const active = accounts.filter((a) => a.status === 'active').length;
  if (active === accounts.length) return 'active';
  return active > 0 ? 'partial' : 'none';
}

/** Gruppiert Accounts nach schoolId (Admin-Accounts ohne Schule werden ignoriert). */
export function groupAccountsBySchool(accounts: UserAccount[]): Map<string, UserAccount[]> {
  const map = new Map<string, UserAccount[]>();
  for (const a of accounts) {
    if (!a.schoolId) continue;
    const list = map.get(a.schoolId) ?? [];
    list.push(a);
    map.set(a.schoolId, list);
  }
  return map;
}

/** Kleinschreibung + Akzente entfernen ("Zürich" -> "zurich"). */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Ein Filter, der alles durchlässt. */
export function emptyFilter(): SchoolFilter {
  return { query: '', region: '', country: '', status: '' };
}

/**
 * Filtert Hochschulen. Freitext (case- und akzentunabhängig) über Name, Kürzel,
 * Stadt, Land und schoolId; Region/Land exakt; Status über schoolAccessStatus.
 */
export function filterSchools(
  schools: School[],
  accounts: UserAccount[],
  filter: SchoolFilter,
): School[] {
  const q = fold(filter.query.trim());
  const byschool = groupAccountsBySchool(accounts);
  return schools.filter((s) => {
    if (filter.region && s.region !== filter.region) return false;
    if (filter.country && s.country !== filter.country) return false;
    if (filter.status && schoolAccessStatus(byschool.get(s.schoolId) ?? []) !== filter.status) return false;
    if (q) {
      const haystack = fold([s.name, s.shortName, s.city, s.country, s.schoolId].join(' '));
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/** Auswahlwerte für die Filter-Dropdowns: eindeutig und sortiert. */
export function filterOptions(schools: School[]): { regions: string[]; countries: string[] } {
  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
  return { regions: uniq(schools.map((s) => s.region)), countries: uniq(schools.map((s) => s.country)) };
}
