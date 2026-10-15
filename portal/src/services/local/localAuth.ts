/**
 * Lokale AuthService-Implementierung (Demo): Login per uid, Sitzung im Storage.
 */
import { canSignIn } from '../../domain/access';
import { PortalError } from '../../domain/types';
import type { Session, UserAccount } from '../../domain/types';
import type { AuthService } from '../ports';

export interface LocalAuthDeps {
  /** Liefert den aktuellen Stand aller Accounts (Seed oder gespeicherter Stand). */
  loadUsers: () => UserAccount[];
  loadSessionUid: () => string | null;
  saveSessionUid: (uid: string | null) => void;
}

/** Baut aus einem Account die Sitzungsdaten (entspricht später Firebase-Claims). */
export function toSession(u: UserAccount): Session {
  return { uid: u.uid, role: u.role, schoolId: u.schoolId, displayName: u.displayName, email: u.email };
}

/** Erzeugt den lokalen AuthService. */
export function createLocalAuth(deps: LocalAuthDeps): AuthService {
  return {
    async listDemoAccounts() {
      return deps.loadUsers();
    },

    async signIn(uid) {
      const user = deps.loadUsers().find((u) => u.uid === uid);
      if (!user) throw new PortalError('auth/user-not-found', 'Unknown account.');
      const check = canSignIn(user);
      if (!check.ok) throw new PortalError(check.code);
      deps.saveSessionUid(user.uid);
      return toSession(user);
    },

    async signOut() {
      deps.saveSessionUid(null);
    },

    async currentSession() {
      const uid = deps.loadSessionUid();
      if (!uid) return null;
      // User neu laden: wurde er inzwischen gesperrt, endet die Sitzung (auch nach Reload).
      const user = deps.loadUsers().find((u) => u.uid === uid);
      if (!user || !canSignIn(user).ok) {
        deps.saveSessionUid(null);
        return null;
      }
      return toSession(user);
    },
  };
}
