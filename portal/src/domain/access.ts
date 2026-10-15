/**
 * Zugriffsregeln als reine Funktionen (admin liest alles, school nur die eigene Schule).
 * Gegenstück in firebase/firestore.rules. Die dortige Zusatzprüfung
 * "users/{uid}.status == 'active'" erledigt lokal requireActiveSession in
 * services/local/localData.ts. Regeln für aggregates/benchmarks/reports
 * kommen hinzu, sobald die Auswertungen eingehängt werden.
 */
import { PortalError } from './types';
import type { PortalErrorCode, Session, UserAccount } from './types';

/** Darf sich dieser Account anmelden? disabled/invited werden mit Fehlercode abgewiesen. */
export function canSignIn(user: Pick<UserAccount, 'status'>): { ok: true } | { ok: false; code: PortalErrorCode } {
  if (user.status === 'disabled') return { ok: false, code: 'auth/user-disabled' };
  if (user.status === 'invited') return { ok: false, code: 'auth/not-activated' };
  return { ok: true };
}

/** Ist die Sitzung ein Admin? */
export function isAdmin(session: Session | null | undefined): boolean {
  return session?.role === 'admin';
}

/** Admin darf jede Hochschule lesen, die School-Rolle nur die eigene. */
export function canReadSchool(session: Session | null | undefined, schoolId: string): boolean {
  if (!session) return false;
  if (session.role === 'admin') return true;
  return session.schoolId !== null && session.schoolId === schoolId;
}

/** Wirft permission-denied, wenn die Sitzung kein Admin ist. */
export function assertAdmin(session: Session | null | undefined): void {
  if (!isAdmin(session)) throw new PortalError('permission-denied', 'Administrators only.');
}

/** Wirft permission-denied, wenn die Sitzung die Hochschule nicht lesen darf. */
export function assertCanReadSchool(session: Session | null | undefined, schoolId: string): void {
  if (!canReadSchool(session, schoolId)) {
    throw new PortalError('permission-denied', 'You do not have access to this institution.');
  }
}

/** Prüft Einladungsdaten (E-Mail-Format, Name, Schule); wirft invalid-argument. */
export function validateInvite(input: { schoolId: string; email: string; displayName: string }): void {
  if (!input.schoolId?.trim()) throw new PortalError('invalid-argument', 'Institution is missing.');
  if (!input.displayName?.trim()) throw new PortalError('invalid-argument', 'Name is missing.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email?.trim() ?? '')) {
    throw new PortalError('invalid-argument', 'Invalid email address.');
  }
}
