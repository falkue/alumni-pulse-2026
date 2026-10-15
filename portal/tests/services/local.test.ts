import { createLocalServices } from '../../src/services/local/localData';
import { createMemoryStorage } from '../../src/services/local/storage';
import type { StorageLike } from '../../src/services/local/storage';
import type { School, Session, UserAccount } from '../../src/domain/types';
import schoolsSeed from '../../seed/schools.json';
import usersSeed from '../../seed/users.json';

const seedSchools = schoolsSeed as School[];
const seedUsers = usersSeed as UserAccount[];

function make(storage: StorageLike = createMemoryStorage(), extra: { now?: () => Date; idGen?: () => string } = {}) {
  return createLocalServices({ storage, seedSchools, seedUsers, ...extra });
}
const code = (c: string) => expect.objectContaining({ code: c });

describe('Login', () => {
  it('aktiver Account ok', async () => {
    const { auth } = make();
    const s = await auth.signIn('u-S002');
    expect(s).toMatchObject({ uid: 'u-S002', role: 'school', schoolId: 'S002' });
  });
  it('disabled / invited / unbekannt', async () => {
    const { auth } = make();
    await expect(auth.signIn('u-S007')).rejects.toEqual(code('auth/user-disabled'));
    await expect(auth.signIn('u-S010')).rejects.toEqual(code('auth/not-activated'));
    await expect(auth.signIn('gibts-nicht')).rejects.toEqual(code('auth/user-not-found'));
  });
  it('listDemoAccounts liefert alle Accounts', async () => {
    expect(await make().auth.listDemoAccounts()).toHaveLength(54);
  });
  it('Sitzung überlebt Reload; signOut beendet sie', async () => {
    const storage = createMemoryStorage();
    await make(storage).auth.signIn('u-S002');
    const reloaded = make(storage);
    expect((await reloaded.auth.currentSession())?.uid).toBe('u-S002');
    await reloaded.auth.signOut();
    expect(await make(storage).auth.currentSession()).toBeNull();
  });
  it('Sperre greift bei bestehender Sitzung nach Reload', async () => {
    const storage = createMemoryStorage();
    const first = make(storage);
    await first.auth.signIn('u-S002');
    const admin = await first.auth.signIn('admin-demo'); // Sitzung wechselt zum Admin
    await first.data.setAccountStatus(admin, 'u-S002', 'disabled');
    // Sitzung des gesperrten Users wiederherstellen (Session-Key manuell setzen)
    storage.setItem('apulse.v1.session', JSON.stringify('u-S002'));
    expect(await make(storage).auth.currentSession()).toBeNull();
  });
});

describe('Mandantentrennung', () => {
  let school: Session;
  let svc: ReturnType<typeof make>;
  beforeEach(async () => {
    svc = make();
    school = await svc.auth.signIn('u-S002');
  });
  it('school liest nur die eigene Schule', async () => {
    expect((await svc.data.getSchool(school, 'S002')).schoolId).toBe('S002');
    await expect(svc.data.getSchool(school, 'S003')).rejects.toEqual(code('permission-denied'));
  });
  it('listSchools / listAccounts / setAccountStatus / inviteAccount verboten', async () => {
    await expect(svc.data.listSchools(school)).rejects.toEqual(code('permission-denied'));
    await expect(svc.data.listAccounts(school)).rejects.toEqual(code('permission-denied'));
    await expect(svc.data.setAccountStatus(school, 'u-S003', 'disabled')).rejects.toEqual(code('permission-denied'));
    await expect(
      svc.data.inviteAccount(school, { schoolId: 'S002', email: 'n@x.example', displayName: 'N' }),
    ).rejects.toEqual(code('permission-denied'));
  });
  it('Admin sieht alles; unbekannte Schule -> not-found', async () => {
    const admin = await svc.auth.signIn('admin-demo');
    expect(await svc.data.listSchools(admin)).toHaveLength(51); // 50 + Demo "ALL"
    expect(await svc.data.listAccounts(admin)).toHaveLength(54);
    expect(await svc.data.listAccounts(admin, 'S001')).toHaveLength(2);
    await expect(svc.data.getSchool(admin, 'S999')).rejects.toEqual(code('not-found'));
  });
});

describe('Live-Statusprüfung (wie firestore.rules)', () => {
  it('deaktivierte Sitzung verliert sofort den Datenzugriff – ohne Reload', async () => {
    const storage = createMemoryStorage();
    const svc = make(storage);
    const school = await svc.auth.signIn('u-S002');
    const admin = await svc.auth.signIn('admin-demo');
    await svc.data.setAccountStatus(admin, 'u-S002', 'disabled');
    // Die alte Session des Hochschul-Users (z. B. in einem zweiten Tab) ist sofort wirkungslos
    await expect(svc.data.getSchool(school, 'S002')).rejects.toEqual(code('permission-denied'));
  });
  it('gefälschte Session (falsche Rolle/Hochschule) wird abgelehnt', async () => {
    const { data } = make();
    const forged: Session = { uid: 'u-S002', role: 'admin', schoolId: null, displayName: 'x', email: 'x' };
    await expect(data.listSchools(forged)).rejects.toEqual(code('permission-denied'));
    const otherSchool: Session = { uid: 'u-S002', role: 'school', schoolId: 'S003', displayName: 'x', email: 'x' };
    await expect(data.getSchool(otherSchool, 'S003')).rejects.toEqual(code('permission-denied'));
  });
});

describe('Demo-Sicht "ALL"', () => {
  it('Demo-Account sieht nur ALL, nicht einzelne Hochschulen', async () => {
    const svc = make();
    const demo = await svc.auth.signIn('u-ALL');
    expect((await svc.data.getSchool(demo, 'ALL')).isDemo).toBe(true);
    await expect(svc.data.getSchool(demo, 'S001')).rejects.toEqual(code('permission-denied'));
    await expect(svc.data.listSchools(demo)).rejects.toEqual(code('permission-denied'));
  });
  it('normale Hochschule darf ALL nicht lesen', async () => {
    const svc = make();
    const school = await svc.auth.signIn('u-S002');
    await expect(svc.data.getSchool(school, 'ALL')).rejects.toEqual(code('permission-denied'));
  });
});

describe('Admin-Aktionen', () => {
  const fixed = new Date('2026-11-02T10:00:00.000Z');

  it('deaktivieren/aktivieren persistiert über Reload, setzt updatedAt/updatedBy', async () => {
    const storage = createMemoryStorage();
    const a = make(storage, { now: () => fixed });
    const admin = await a.auth.signIn('admin-demo');
    const off = await a.data.setAccountStatus(admin, 'u-S001', 'disabled');
    expect(off).toMatchObject({ status: 'disabled', updatedAt: fixed.toISOString(), updatedBy: 'admin-demo' });

    const b = make(storage); // "Reload"
    const list = await b.data.listAccounts(admin, 'S001');
    expect(list.find((u) => u.uid === 'u-S001')?.status).toBe('disabled');
    await b.data.setAccountStatus(admin, 'u-S001', 'active');
    expect((await make(storage).data.listAccounts(admin, 'S001')).find((u) => u.uid === 'u-S001')?.status).toBe('active');
  });
  it('Status invited ist als Ziel nicht erlaubt; unbekannte uid -> not-found', async () => {
    const { auth, data } = make();
    const admin = await auth.signIn('admin-demo');
    await expect(data.setAccountStatus(admin, 'u-S001', 'invited')).rejects.toEqual(code('invalid-argument'));
    await expect(data.setAccountStatus(admin, 'nope', 'active')).rejects.toEqual(code('not-found'));
  });
  it('Admin kann sich nicht selbst deaktivieren', async () => {
    const { auth, data } = make();
    const admin = await auth.signIn('admin-demo');
    await expect(data.setAccountStatus(admin, 'admin-demo', 'disabled')).rejects.toEqual(code('invalid-argument'));
  });
  it('Einladung: legt invited-Account an, persistiert, loggt Mock-Hinweis', async () => {
    const storage = createMemoryStorage();
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { auth, data } = make(storage, { idGen: () => 'u-new', now: () => fixed });
    const admin = await auth.signIn('admin-demo');
    const acc = await data.inviteAccount(admin, { schoolId: 'S003', email: ' neu@x.example ', displayName: 'Neu' });
    expect(acc).toMatchObject({ uid: 'u-new', status: 'invited', role: 'school', schoolId: 'S003', email: 'neu@x.example' });
    expect(info).toHaveBeenCalled();
    info.mockRestore();
    expect(await make(storage).data.listAccounts(admin, 'S003')).toHaveLength(2);
    await expect(make(storage).auth.signIn('u-new')).rejects.toEqual(code('auth/not-activated'));
  });
  it('Einladung: Validierung, unbekannte Schule, doppelte E-Mail', async () => {
    const { auth, data } = make();
    const admin = await auth.signIn('admin-demo');
    const ok = { schoolId: 'S003', email: 'neu@x.example', displayName: 'Neu' };
    await expect(data.inviteAccount(admin, { ...ok, email: 'kaputt' })).rejects.toEqual(code('invalid-argument'));
    await expect(data.inviteAccount(admin, { ...ok, schoolId: 'S999' })).rejects.toEqual(code('not-found'));
    await expect(data.inviteAccount(admin, { ...ok, email: 'S003@DEMO.alumnipulse.example' })).rejects.toEqual(code('invalid-argument'));
  });
  it('Default-uid hat Schul-Präfix', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { auth, data } = make();
    const admin = await auth.signIn('admin-demo');
    const acc = await data.inviteAccount(admin, { schoolId: 'S003', email: 'z@x.example', displayName: 'Z' });
    expect(acc.uid).toMatch(/^u-S003-/);
    vi.restoreAllMocks();
  });
  it('resetDemoData stellt Seed wieder her und beendet die Sitzung', async () => {
    const storage = createMemoryStorage();
    const { auth, data } = make(storage);
    const admin = await auth.signIn('admin-demo');
    await data.setAccountStatus(admin, 'u-S001', 'disabled');
    await data.resetDemoData?.();
    const fresh = make(storage);
    expect(await fresh.auth.currentSession()).toBeNull();
    const admin2 = await fresh.auth.signIn('admin-demo');
    expect((await fresh.data.listAccounts(admin2, 'S001')).find((u) => u.uid === 'u-S001')?.status).toBe('active');
  });
});
