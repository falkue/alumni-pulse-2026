import { describe, expect, it } from 'vitest';
import { PortalError, type PortalErrorCode } from '../../src/domain/types';
import { errorMessage, formatDateTime, formatNumber, institutionTypeLabel } from '../../src/ui/format';

describe('institutionTypeLabel', () => {
  it('übersetzt bekannte Typen', () => {
    expect(institutionTypeLabel('private_business_school')).toBe('Private business school');
    expect(institutionTypeLabel('public_university')).toBe('Public university');
    expect(institutionTypeLabel('applied_sciences_university')).toBe('University of applied sciences');
  });
  it('nutzt für unbekannte Typen einen lesbaren Fallback', () => {
    expect(institutionTypeLabel('some_new_type')).toBe('Some new type');
  });
});

describe('formatDateTime', () => {
  it('formatiert gültiges ISO im en-GB-Format', () => {
    const out = formatDateTime('2026-10-15T14:30:00');
    expect(out).toContain('15');
    expect(out).toContain('2026');
    expect(out).toMatch(/14[:.]30/);
  });
  it('gibt ungültige Strings unverändert zurück', () => {
    expect(formatDateTime('kein-datum')).toBe('kein-datum');
  });
});

describe('formatNumber', () => {
  it('trennt Tausender mit Komma', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });
  it('lässt kleine Zahlen unverändert', () => {
    expect(formatNumber(999)).toBe('999');
  });
});

describe('errorMessage', () => {
  const codes: PortalErrorCode[] = [
    'auth/user-not-found',
    'auth/user-disabled',
    'auth/not-activated',
    'permission-denied',
    'not-found',
    'invalid-argument',
  ];
  it.each(codes)('liefert für %s einen englischen Text', (code) => {
    const msg = errorMessage(new PortalError(code));
    expect(msg.length).toBeGreaterThan(5);
    expect(msg).not.toContain('Unexpected');
    expect(msg).not.toBe(code);
  });
  it('hängt bei invalid-argument die Detailmeldung an', () => {
    expect(errorMessage(new PortalError('invalid-argument', 'Email missing'))).toContain('Email missing');
  });
  it('gibt für fremde Fehler eine generische Meldung', () => {
    expect(errorMessage(new Error('boom'))).toBe('Unexpected error. Please try again.');
    expect(errorMessage('x')).toContain('Unexpected error');
  });
});
