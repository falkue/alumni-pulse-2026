import { assertAdmin, assertCanReadSchool, canReadSchool, canSignIn, isAdmin, validateInvite } from '../../src/domain/access';
import { PortalError } from '../../src/domain/types';
import type { Session } from '../../src/domain/types';

const admin: Session = { uid: 'a', role: 'admin', schoolId: null, displayName: 'A', email: 'a@x.example' };
const school: Session = { uid: 's', role: 'school', schoolId: 'S001', displayName: 'S', email: 's@x.example' };
const valid = { schoolId: 'S001', email: 'a@b.example', displayName: 'Name' };

describe('canSignIn', () => {
  it('active ok', () => expect(canSignIn({ status: 'active' })).toEqual({ ok: true }));
  it('disabled', () => expect(canSignIn({ status: 'disabled' })).toEqual({ ok: false, code: 'auth/user-disabled' }));
  it('invited', () => expect(canSignIn({ status: 'invited' })).toEqual({ ok: false, code: 'auth/not-activated' }));
});

describe('Rollen und Leserechte', () => {
  it('isAdmin', () => {
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(school)).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
  it('canReadSchool', () => {
    expect(canReadSchool(admin, 'S999')).toBe(true);
    expect(canReadSchool(school, 'S001')).toBe(true);
    expect(canReadSchool(school, 'S002')).toBe(false);
    expect(canReadSchool(null, 'S001')).toBe(false);
  });
  it('assert* werfen permission-denied', () => {
    expect(() => assertAdmin(admin)).not.toThrow();
    expect(() => assertAdmin(school)).toThrow(PortalError);
    expect(() => assertCanReadSchool(school, 'S002')).toThrow(expect.objectContaining({ code: 'permission-denied' }));
    expect(() => assertCanReadSchool(school, 'S001')).not.toThrow();
  });
});

describe('validateInvite', () => {
  it('akzeptiert gültige Eingaben', () => expect(() => validateInvite(valid)).not.toThrow());
  it.each([
    ['E-Mail ohne @', { ...valid, email: 'abc' }],
    ['E-Mail ohne Domain-Punkt', { ...valid, email: 'a@b' }],
    ['leerer Name', { ...valid, displayName: '  ' }],
    ['leere Schule', { ...valid, schoolId: '' }],
  ])('lehnt ab: %s', (_n, input) => {
    expect(() => validateInvite(input)).toThrow(expect.objectContaining({ code: 'invalid-argument' }));
  });
});
