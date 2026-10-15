/**
 * Lokale DataService-Implementierung (Demo) plus Factory für beide Services.
 *
 * Jede Datenmethode prüft zwei Dinge – genau wie später firestore.rules:
 *  1. Ist der handelnde Account JETZT noch aktiv und passen Rolle/Hochschule
 *     zur Sitzung? (requireActiveSession, Live-Prüfung gegen die Users-Daten)
 *  2. Darf diese Rolle die Aktion? (domain/access.ts, Mandantentrennung)
 * Ausnahme: resetDemoData (reine Demo-Hilfe ohne Sitzung).
 */
import { assertAdmin, assertCanReadSchool, validateInvite } from '../../domain/access';
import { PortalError } from '../../domain/types';
import type { AccountStatus, School, Session, UserAccount } from '../../domain/types';
import { mapAgeOverview, mapAgeWaves } from '../../domain/age';
import { mapEmploymentOverview } from '../../domain/employment';
import { mapChartInsight } from '../../domain/insights';
import type { AggregateSource, AuthService, DataService, InsightSource } from '../ports';
import { createLocalAuth } from './localAuth';
import { createStore } from './storage';
import type { StorageLike } from './storage';

export interface LocalServicesOptions {
  /** Default: window.localStorage. */
  storage?: StorageLike;
  seedSchools: School[];
  seedUsers: UserAccount[];
  /** Zeitquelle (für Tests injizierbar). */
  now?: () => Date;
  /** ID-Generator für neue Accounts (Tests injizierbar). */
  idGen?: () => string;
  /** Quelle der Aggregat-Dateien (Default: wirft not-found). Tests geben Fixtures hinein. */
  aggregates?: AggregateSource;
  /** Quelle der KI-Interpretationen (Default: keine -> null). */
  insights?: InsightSource;
}

const USERS_KEY = 'users';
const SESSION_KEY = 'session';

/** Erzeugt Auth- und Daten-Service auf Basis eines (injizierbaren) Storage. */
export function createLocalServices(opts: LocalServicesOptions): { auth: AuthService; data: DataService } {
  const store = createStore(opts.storage);
  const now = opts.now ?? (() => new Date());
  const schools = opts.seedSchools;
  const aggregates: AggregateSource =
    opts.aggregates ??
    (async () => {
      throw new PortalError('not-found', 'No aggregate source configured.');
    });

  // Users: gespeicherter Stand, sonst Seed. Geschrieben wird erst bei der ersten Änderung.
  const loadUsers = (): UserAccount[] => store.get<UserAccount[]>(USERS_KEY) ?? structuredClone(opts.seedUsers);
  const saveUsers = (users: UserAccount[]) => store.set(USERS_KEY, users);

  const auth = createLocalAuth({
    loadUsers,
    loadSessionUid: () => store.get<string>(SESSION_KEY),
    saveSessionUid: (uid) => (uid === null ? store.remove(SESSION_KEY) : store.set(SESSION_KEY, uid)),
  });

  /**
   * Live-Prüfung des handelnden Accounts (Spiegel von isActiveUser() in
   * firestore.rules): Wurde der Account inzwischen deaktiviert oder hat sich
   * seine Rolle/Hochschule geändert, wird die Aktion sofort verweigert –
   * nicht erst nach einem Reload.
   */
  const requireActiveSession = (session: Session): void => {
    const user = loadUsers().find((u) => u.uid === session.uid);
    if (!user || user.status !== 'active' || user.role !== session.role || user.schoolId !== session.schoolId) {
      throw new PortalError('permission-denied', 'Session is no longer valid.');
    }
  };

  const data: DataService = {
    async listSchools(session) {
      requireActiveSession(session);
      assertAdmin(session);
      return structuredClone(schools);
    },

    async getSchool(session, schoolId) {
      requireActiveSession(session);
      assertCanReadSchool(session, schoolId);
      const school = schools.find((s) => s.schoolId === schoolId);
      if (!school) throw new PortalError('not-found', 'Institution not found.');
      return structuredClone(school);
    },

    async listAccounts(session, schoolId) {
      requireActiveSession(session);
      assertAdmin(session);
      const users = loadUsers();
      return schoolId ? users.filter((u) => u.schoolId === schoolId) : users;
    },

    async setAccountStatus(session, uid, status: AccountStatus) {
      requireActiveSession(session);
      assertAdmin(session);
      if (status !== 'active' && status !== 'disabled') {
        throw new PortalError('invalid-argument', 'Only active and disabled are allowed.');
      }
      if (uid === session.uid && status === 'disabled') {
        throw new PortalError('invalid-argument', 'You cannot deactivate your own account.');
      }
      const users = loadUsers();
      const idx = users.findIndex((u) => u.uid === uid);
      if (idx < 0) throw new PortalError('not-found', 'Account not found.');
      const updated: UserAccount = { ...users[idx], status, updatedAt: now().toISOString(), updatedBy: session.uid };
      users[idx] = updated;
      saveUsers(users);
      return updated;
    },

    async inviteAccount(session, input) {
      requireActiveSession(session);
      assertAdmin(session);
      validateInvite(input);
      if (!schools.some((s) => s.schoolId === input.schoolId)) {
        throw new PortalError('not-found', 'Institution not found.');
      }
      const users = loadUsers();
      const email = input.email.trim();
      if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
        throw new PortalError('invalid-argument', 'This email address is already in use.');
      }
      const ts = now().toISOString();
      const account: UserAccount = {
        uid: opts.idGen ? opts.idGen() : `u-${input.schoolId}-${Math.random().toString(36).slice(2, 8)}`,
        email,
        displayName: input.displayName.trim(),
        role: 'school',
        schoolId: input.schoolId,
        status: 'invited',
        createdAt: ts,
        updatedAt: ts,
        updatedBy: session.uid,
      };
      users.push(account);
      saveUsers(users);
      console.info('Invitation (mock) – no email sent:', email);
      return account;
    },

    async getAgeOverview(session, schoolId) {
      // Erst Rechte prüfen, DANN laden: eine Hochschule lädt nie fremde Dateien.
      requireActiveSession(session);
      assertCanReadSchool(session, schoolId);
      return mapAgeOverview(await aggregates('schools', schoolId));
    },

    async getAgeWaves(session, schoolId) {
      requireActiveSession(session);
      assertCanReadSchool(session, schoolId);
      return mapAgeWaves(await aggregates('waves_mock', schoolId));
    },

    async getEmploymentFlow(session, schoolId) {
      // wie oben: erst Rechte, dann genau EINE Datei der eigenen Hochschule laden
      requireActiveSession(session);
      assertCanReadSchool(session, schoolId);
      return mapEmploymentOverview(await aggregates('schools', schoolId));
    },

    async getChartInsight(session, schoolId, chartId) {
      // gleiche Mandantentrennung wie bei den Aggregaten: erst prüfen, dann EINE Datei laden
      requireActiveSession(session);
      assertCanReadSchool(session, schoolId);
      const raw = opts.insights ? await opts.insights(chartId, schoolId) : null;
      return raw ? mapChartInsight(raw) : null;
    },

    /** Nur Demo: setzt den lokalen Zustand auf den Seed zurück (keine Rechteprüfung, kein Firebase-Gegenstück). */
    async resetDemoData() {
      store.remove(USERS_KEY);
      store.remove(SESSION_KEY);
    },
  };

  return { auth, data };
}
