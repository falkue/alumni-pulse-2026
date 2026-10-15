/**
 * In-Memory-Fakes für Auth- und DataService (nur für UI-Tests).
 * Verhalten bewusst minimal, aber vertragskonform (PortalError-Codes).
 */
import { PortalError, type AccountStatus, type School, type Session, type UserAccount } from '../../src/domain/types';
import type { AuthService, DataService } from '../../src/services/ports';
import { mapAgeOverview, mapAgeWaves } from '../../src/domain/age';
import { mapEmploymentOverview } from '../../src/domain/employment';
import { mapChartInsight } from '../../src/domain/insights';
import { rawEmploymentS040, rawInsightS040, rawSchoolAll, rawSchoolS001, rawWavesAll, rawWavesLateJoiner } from '../fixtures/age';

const NOW = '2026-10-01T10:00:00.000Z';

function school(id: string, name: string, country: string, region: string, city: string, n: number): School {
  return {
    schoolId: id, name, shortName: id.toLowerCase(), country, iso2: country.slice(0, 2).toUpperCase(), region,
    subregion: region, city, institutionType: 'private_business_school', aacsb: true, equis: false, bgsChapter: false,
    foundedYear: 1990, alumniBaseSize: 5000, rankingTier: 1, currency: 'EUR', nRespondents: n, notes: '',
  };
}

export const SCHOOLS: School[] = [
  school('S001', 'Alpha Business School', 'Switzerland', 'Europe', 'Zurich', 100),
  school('S002', 'Beta Institute of Management', 'Japan', 'Asia', 'Tokyo', 200),
  school('S003', 'Gamma University', 'Brazil', 'Americas', 'Sao Paulo', 300),
  school('S004', 'Delta Graduate School', 'France', 'Europe', 'Paris', 400),
  // Gepoolte Demo-Sicht (keine echte Hochschule)
  { ...school('ALL', 'All participating schools (demo)', '', 'All regions', '', 1000), aacsb: false, isDemo: true },
];

function account(uid: string, role: 'admin' | 'school', schoolId: string | null, status: AccountStatus, displayName: string): UserAccount {
  return {
    uid, email: `${uid}@demo.example`, displayName, role, schoolId, status,
    createdAt: NOW, updatedAt: NOW, updatedBy: null,
  };
}

export function initialAccounts(): UserAccount[] {
  return [
    account('admin-demo', 'admin', null, 'active', 'Admin Demo'),
    account('u-S001', 'school', 'S001', 'active', 'Alice Alpha'),
    account('u-S002', 'school', 'S002', 'disabled', 'Bob Beta'),
    account('u-S003', 'school', 'S003', 'invited', 'Carla Gamma'),
    account('u-ALL', 'school', 'ALL', 'active', 'Demo: all schools'),
    // S004 hat keinen Account -> "Kein Zugang"
  ];
}

export interface Fakes {
  auth: AuthService;
  data: DataService;
  /** Aufzeichnung der setAccountStatus-Aufrufe */
  statusCalls: Array<{ uid: string; status: AccountStatus }>;
  /** Aufzeichnung der Alters-Ladevorgänge (Mandantentrennung prüfbar) */
  ageCalls: Array<{ kind: 'overview' | 'waves'; schoolId: string }>;
  accounts: UserAccount[];
}

/** Erzeugt frische Fakes. `sessionUid`: bereits angemeldeter User (oder keiner). */
export function createFakes(sessionUid?: string): Fakes {
  const accounts = initialAccounts();
  const statusCalls: Fakes['statusCalls'] = [];
  const ageCalls: Fakes['ageCalls'] = [];
  let current: Session | null = null;

  const toSession = (a: UserAccount): Session => ({
    uid: a.uid, role: a.role, schoolId: a.schoolId, displayName: a.displayName, email: a.email,
  });
  if (sessionUid) current = toSession(accounts.find((a) => a.uid === sessionUid)!);

  const auth: AuthService = {
    async listDemoAccounts() {
      return accounts.map((a) => ({ ...a }));
    },
    async signIn(uid) {
      const a = accounts.find((x) => x.uid === uid);
      if (!a) throw new PortalError('auth/user-not-found');
      if (a.status === 'disabled') throw new PortalError('auth/user-disabled');
      if (a.status === 'invited') throw new PortalError('auth/not-activated');
      current = toSession(a);
      return current;
    },
    async signOut() {
      current = null;
    },
    async currentSession() {
      return current;
    },
  };

  const requireAdmin = (s: Session) => {
    if (s.role !== 'admin') throw new PortalError('permission-denied');
  };

  const data: DataService = {
    async listSchools(s) {
      requireAdmin(s);
      return SCHOOLS.map((x) => ({ ...x }));
    },
    async getSchool(s, id) {
      if (s.role !== 'admin' && s.schoolId !== id) throw new PortalError('permission-denied');
      const found = SCHOOLS.find((x) => x.schoolId === id);
      if (!found) throw new PortalError('not-found');
      return { ...found };
    },
    async listAccounts(s, schoolId) {
      requireAdmin(s);
      return accounts.filter((a) => !schoolId || a.schoolId === schoolId).map((a) => ({ ...a }));
    },
    async setAccountStatus(s, uid, status) {
      requireAdmin(s);
      statusCalls.push({ uid, status });
      const a = accounts.find((x) => x.uid === uid);
      if (!a) throw new PortalError('not-found');
      a.status = status;
      a.updatedAt = '2026-10-15T12:30:00.000Z';
      a.updatedBy = s.uid;
      return { ...a };
    },
    async inviteAccount(s, input) {
      requireAdmin(s);
      const a = account(`u-new-${accounts.length}`, 'school', input.schoolId, 'invited', input.displayName);
      a.email = input.email;
      accounts.push(a);
      return { ...a };
    },
    // Frage 1 (Alter): Fixtures aus tests/fixtures/age.ts, schoolId der Anfrage übernommen
    async getAgeOverview(s, id) {
      if (s.role !== 'admin' && s.schoolId !== id) throw new PortalError('permission-denied');
      ageCalls.push({ kind: 'overview', schoolId: id });
      return id === 'ALL' ? mapAgeOverview(rawSchoolAll) : { ...mapAgeOverview(rawSchoolS001), schoolId: id };
    },
    // Erwerbsstatus: S040-Fixture; für ALL als Demo markiert
    async getEmploymentFlow(s, id) {
      if (s.role !== 'admin' && s.schoolId !== id) throw new PortalError('permission-denied');
      const raw = id === 'ALL' ? { ...rawEmploymentS040, demo: true, school: { school_id: 'ALL', region: 'All regions' } } : { ...rawEmploymentS040, school: { school_id: id, region: 'Asia' } };
      return mapEmploymentOverview(raw);
    },
    // KI-Interpretation: Fixture für jede Hochschule (schoolId übernommen)
    async getChartInsight(s, id) {
      if (s.role !== 'admin' && s.schoolId !== id) throw new PortalError('permission-denied');
      return { ...mapChartInsight(rawInsightS040), schoolId: id };
    },
    async getAgeWaves(s, id) {
      if (s.role !== 'admin' && s.schoolId !== id) throw new PortalError('permission-denied');
      ageCalls.push({ kind: 'waves', schoolId: id });
      return id === 'ALL' ? mapAgeWaves(rawWavesAll) : { ...mapAgeWaves(rawWavesLateJoiner), schoolId: id };
    },
  };

  return { auth, data, statusCalls, ageCalls, accounts };
}
