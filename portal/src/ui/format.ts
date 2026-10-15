/** Anzeige-Helfer: lesbare Labels, Datumsformat und Fehlermeldungen (alles englisch). */
import type { AccountStatus, SchoolAccessStatus } from '../domain/types';
import { PortalError } from '../domain/types';

const INSTITUTION_TYPES: Record<string, string> = {
  private_business_school: 'Private business school',
  public_business_school: 'Public business school',
  public_university: 'Public university',
  private_university: 'Private university',
  university_of_applied_sciences: 'University of applied sciences',
  applied_sciences_university: 'University of applied sciences',
};

/** "private_business_school" -> "Private Business School" (Fallback: Unterstriche entfernen). */
export function institutionTypeLabel(type: string): string {
  if (INSTITUTION_TYPES[type]) return INSTITUTION_TYPES[type];
  const text = type.replace(/_/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  active: 'Active',
  disabled: 'Disabled',
  invited: 'Invited',
};

export const ACCESS_STATUS_LABEL: Record<SchoolAccessStatus, string> = {
  active: 'Active',
  partial: 'Partial',
  none: 'No access',
};

/** ISO-Zeitstempel -> "15 Oct 2026, 14:30" (en-GB). */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

/**
 * Zahl mit Tausendertrennzeichen im en-GB-Format, z. B. 12345 -> "12,345".
 */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-GB').format(n);
}

/** Übersetzt Fehler der Service-Schicht in verständliche Meldungen. */
export function errorMessage(err: unknown): string {
  if (err instanceof PortalError) {
    switch (err.code) {
      case 'auth/user-disabled':
        return 'This account is disabled. Please contact the project team.';
      case 'auth/not-activated':
        return 'Not yet activated. This account has been invited but not yet activated.';
      case 'auth/user-not-found':
        return 'This account could not be found.';
      case 'permission-denied':
        return 'You do not have permission to do this.';
      case 'not-found':
        return 'The item could not be found.';
      case 'invalid-argument':
        return 'The input is invalid. ' + (err.message !== err.code ? err.message : '');
    }
  }
  return 'Unexpected error. Please try again.';
}
