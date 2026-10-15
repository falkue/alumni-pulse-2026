import { emptyFilter, filterOptions, filterSchools, groupAccountsBySchool, schoolAccessStatus } from '../../src/domain/schools';
import type { AccountStatus, School, UserAccount } from '../../src/domain/types';

const school = (o: Partial<School>): School => ({
  schoolId: 'S001', name: 'Test', shortName: 'T', country: 'Switzerland', iso2: 'CH', region: 'Europe',
  subregion: '', city: 'Zurich', institutionType: '', aacsb: false, equis: false, bgsChapter: false,
  foundedYear: 2000, alumniBaseSize: 1, rankingTier: 1, currency: 'CHF', nRespondents: 1, notes: '', ...o,
});
const acc = (schoolId: string, status: AccountStatus, uid = `u-${schoolId}-${status}`): UserAccount => ({
  uid, email: `${uid}@x.example`, displayName: uid, role: 'school', schoolId, status,
  createdAt: '', updatedAt: '', updatedBy: null,
});

const schools = [
  school({ schoolId: 'S001', name: 'Hochschule Zürich', shortName: 'HSZ', city: 'Zürich' }),
  school({ schoolId: 'S002', name: 'Asia Business School', shortName: 'ABS', country: 'Japan', region: 'Asia', city: 'Tokyo' }),
  school({ schoolId: 'S003', name: 'Paris Management', shortName: 'PM', country: 'France', city: 'Paris' }),
];
const accounts = [acc('S001', 'active'), acc('S002', 'active', 'a'), acc('S002', 'disabled', 'b'), acc('S003', 'invited')];

describe('schoolAccessStatus', () => {
  it('alle aktiv -> active', () => expect(schoolAccessStatus([acc('S', 'active')])).toBe('active'));
  it('gemischt -> partial', () => expect(schoolAccessStatus([acc('S', 'active', 'a'), acc('S', 'disabled', 'b')])).toBe('partial'));
  it('keiner aktiv -> none', () => expect(schoolAccessStatus([acc('S', 'invited')])).toBe('none'));
  it('keine Accounts -> none', () => expect(schoolAccessStatus([])).toBe('none'));
});

describe('filterSchools', () => {
  it('leerer Filter lässt alles durch', () => expect(filterSchools(schools, accounts, emptyFilter())).toHaveLength(3));
  it('Freitext ist akzent- und case-unabhängig', () => {
    expect(filterSchools(schools, accounts, { ...emptyFilter(), query: 'ZURICH' }).map((s) => s.schoolId)).toEqual(['S001']);
    expect(filterSchools(schools, accounts, { ...emptyFilter(), query: 'zürich' })).toHaveLength(1);
  });
  it('findet über schoolId, Kürzel und Land', () => {
    expect(filterSchools(schools, accounts, { ...emptyFilter(), query: 's003' })).toHaveLength(1);
    expect(filterSchools(schools, accounts, { ...emptyFilter(), query: 'abs' })).toHaveLength(1);
    expect(filterSchools(schools, accounts, { ...emptyFilter(), query: 'japan' })).toHaveLength(1);
  });
  it('Region und Land exakt', () => {
    expect(filterSchools(schools, accounts, { ...emptyFilter(), region: 'Asia' })).toHaveLength(1);
    expect(filterSchools(schools, accounts, { ...emptyFilter(), country: 'France' })).toHaveLength(1);
    expect(filterSchools(schools, accounts, { ...emptyFilter(), country: 'Fran' })).toHaveLength(0);
  });
  it('Status', () => {
    const ids = (status: '' | 'active' | 'partial' | 'none') =>
      filterSchools(schools, accounts, { ...emptyFilter(), status }).map((s) => s.schoolId);
    expect(ids('active')).toEqual(['S001']);
    expect(ids('partial')).toEqual(['S002']);
    expect(ids('none')).toEqual(['S003']);
  });
});

describe('filterOptions / groupAccountsBySchool', () => {
  it('liefert sortierte, eindeutige Werte', () => {
    const o = filterOptions([...schools, school({ schoolId: 'S9', region: 'Asia', country: 'Japan' })]);
    expect(o.regions).toEqual(['Asia', 'Europe']);
    expect(o.countries).toEqual(['France', 'Japan', 'Switzerland']);
  });
  it('gruppiert nach Schule und ignoriert Admins', () => {
    const admin: UserAccount = { ...acc('x', 'active', 'adm'), role: 'admin', schoolId: null };
    const m = groupAccountsBySchool([...accounts, admin]);
    expect(m.get('S002')).toHaveLength(2);
    expect(m.size).toBe(3);
  });
});
