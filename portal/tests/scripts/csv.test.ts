import { readFileSync } from 'node:fs';
import { parseCsv, parseCsvObjects } from '../../scripts/csv.mjs';
import { mapSchool, buildUsers } from '../../scripts/build-seed.mjs';

describe('parseCsv', () => {
  it('trennt einfache Felder und Zeilen (\\n und \\r\\n)', () => {
    expect(parseCsv('a,b\r\nc,d\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });
  it('behandelt Kommas und Zeilenumbrüche in Anführungszeichen', () => {
    expect(parseCsv('a,"b,c","x\ny"\n')).toEqual([['a', 'b,c', 'x\ny']]);
  });
  it('löst doppelte Anführungszeichen auf', () => {
    expect(parseCsv('"sagt ""hi""",z')).toEqual([['sagt "hi"', 'z']]);
  });
  it('behält Umlaute und überspringt Leerzeilen', () => {
    expect(parseCsv('Zürich,Hochschule für Wirtschaft\n\n\nÄ,ß')).toEqual([
      ['Zürich', 'Hochschule für Wirtschaft'],
      ['Ä', 'ß'],
    ]);
  });
  it('behält leere Felder', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
  });
  it('parseCsvObjects nutzt die Kopfzeile', () => {
    expect(parseCsvObjects('x,y\n1,2')).toEqual([{ x: '1', y: '2' }]);
  });
});

describe('Seed-Mapping', () => {
  it('mapSchool wandelt Typen und entfernt Simulationsfelder', () => {
    const [row] = parseCsvObjects(readFileSync('../data/reference/schools.csv', 'utf8'));
    const s = mapSchool(row) as Record<string, unknown>;
    expect(s.name).toBe(row.school_name);
    expect(typeof s.aacsb).toBe('boolean');
    expect(typeof s.alumniBaseSize).toBe('number');
    expect(Object.keys(s).some((k) => /effect|share/i.test(k))).toBe(false);
  });
  it('buildUsers ist deterministisch', () => {
    const schools = [{ schoolId: 'S001', shortName: 'A' }, { schoolId: 'S002', shortName: 'B' }];
    expect(buildUsers(schools)).toEqual(buildUsers(schools));
  });
});

describe('seed/schools.json', () => {
  const schools = JSON.parse(readFileSync('seed/schools.json', 'utf8'));
  const real = schools.filter((s: { isDemo?: boolean }) => !s.isDemo);
  it('enthält 50 echte Schulen mit eindeutigen, sortierten IDs', () => {
    expect(real).toHaveLength(50);
    const ids = real.map((s: { schoolId: string }) => s.schoolId);
    expect(new Set(ids).size).toBe(50);
    expect([...ids].sort()).toEqual(ids);
  });
  it('hängt genau einen Demo-Eintrag "ALL" an (gepoolt, ohne Stammdaten)', () => {
    expect(schools).toHaveLength(51);
    const all = schools.at(-1);
    expect(all).toMatchObject({ schoolId: 'ALL', isDemo: true, country: '', rankingTier: 0, aacsb: false });
    // n = Summe aller echten Hochschulen
    expect(all.nRespondents).toBe(real.reduce((sum: number, s: { nRespondents: number }) => sum + s.nRespondents, 0));
    expect(real.some((s: { isDemo?: boolean }) => s.isDemo !== undefined)).toBe(false);
  });
  it('hat korrekte Feldtypen und keine Simulationsfelder', () => {
    for (const s of schools) {
      expect(typeof s.aacsb).toBe('boolean');
      expect(typeof s.equis).toBe('boolean');
      expect(typeof s.bgsChapter).toBe('boolean');
      for (const k of ['foundedYear', 'alumniBaseSize', 'rankingTier', 'nRespondents']) {
        expect(typeof s[k]).toBe('number');
        expect(Number.isNaN(s[k])).toBe(false);
      }
      expect(Object.keys(s).some((k) => /effect|share/i.test(k))).toBe(false);
    }
  });
});

describe('seed/users.json', () => {
  const users = JSON.parse(readFileSync('seed/users.json', 'utf8'));
  const count = (st: string) => users.filter((u: { status: string }) => u.status === st).length;
  it('hat 1 Admin + 50 Schul-Accounts + 2 Zweit-Accounts + Demo-Account u-ALL', () => {
    expect(users).toHaveLength(54);
    expect(users.filter((u: { role: string }) => u.role === 'admin')).toHaveLength(1);
    expect(new Set(users.map((u: { uid: string }) => u.uid)).size).toBe(54);
    expect(users.find((u: { uid: string }) => u.uid === 'u-ALL')).toMatchObject({ role: 'school', schoolId: 'ALL', status: 'active' });
  });
  it('hat die erwartete Status-Verteilung', () => {
    expect(count('disabled')).toBe(5);
    expect(count('invited')).toBe(4); // S010, S020, S030, S001-b
    expect(count('active')).toBe(45); // inkl. u-ALL
  });
  it('markiert die vorgegebenen Accounts', () => {
    const st = (uid: string) => users.find((u: { uid: string }) => u.uid === uid).status;
    expect(st('u-S007')).toBe('disabled');
    expect(st('u-S020')).toBe('invited');
    expect(st('u-S001-b')).toBe('invited');
    expect(st('u-S002-b')).toBe('active');
  });
});
