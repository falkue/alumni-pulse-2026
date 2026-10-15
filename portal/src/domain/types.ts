/**
 * Domänen-Typen des Portals – der "Vertrag" zwischen UI und Datenschicht.
 *
 * Die Feldnamen sind bewusst Firestore-tauglich gewählt (camelCase, flache
 * Dokumente, IDs als Strings). Jedes Interface entspricht einem Dokument in
 * einer Firestore-Collection (siehe docs/DATA_MODEL.md):
 *
 *   schools/{schoolId}   -> School
 *   users/{uid}          -> UserAccount
 *   aggregates/{schoolId}/... -> (später, von der Datenpipeline befüllt)
 */

/** Rollen. In Firebase später als Custom Claim `role` im ID-Token. */
export type Role = 'admin' | 'school';

/**
 * Account-Status.
 * - invited:  angelegt (Einladung als Mock), noch nicht freigeschaltet
 * - active:   freigeschaltet, Login erlaubt
 * - disabled: deaktiviert, Login gesperrt
 */
export type AccountStatus = 'invited' | 'active' | 'disabled';

/** Eine gebenchmarkte Hochschule (Quelle: data/reference/schools.csv). */
export interface School {
  schoolId: string; // z. B. "S001" – Mandanten-Schlüssel
  name: string;
  shortName: string;
  country: string;
  iso2: string;
  region: string; // Europe | Asia | Americas
  subregion: string;
  city: string;
  institutionType: string; // private_business_school | public_university | ...
  aacsb: boolean;
  equis: boolean;
  bgsChapter: boolean;
  foundedYear: number;
  alumniBaseSize: number;
  rankingTier: number;
  currency: string;
  nRespondents: number;
  notes: string;
  /**
   * true = keine echte Hochschule, sondern die gepoolte Demo-Sicht "ALL"
   * (alle Hochschulen zusammen). Zählt nicht in Admin-Kennzahlen; Stammdaten leer.
   */
  isDemo?: boolean;
}

/** Mandanten-ID der gepoolten Demo-Sicht (alle Hochschulen). */
export const DEMO_ALL_SCHOOL_ID = 'ALL';

/** Ein Login-Account. Gehört entweder zu einer Hochschule (role=school) oder ist Admin. */
export interface UserAccount {
  uid: string;
  email: string; // nur Demo-Adressen (*.example)
  displayName: string;
  role: Role;
  schoolId: string | null; // null nur bei role=admin
  status: AccountStatus;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601 – letzte Änderung (z. B. Statuswechsel)
  updatedBy: string | null; // uid des Admins, der zuletzt geändert hat
}

/** Die eingeloggte Identität – entspricht später Firebase-User + Custom Claims. */
export interface Session {
  uid: string;
  role: Role;
  schoolId: string | null;
  displayName: string;
  email: string;
}

/** Abgeleiteter Status einer Hochschule aus Sicht der Admin-Liste. */
export type SchoolAccessStatus = 'active' | 'partial' | 'none';

/** Filterkriterien der Admin-Liste. Leere Strings = "alle". */
export interface SchoolFilter {
  query: string; // Freitext: Name, Kürzel, Stadt, schoolId
  region: string;
  country: string;
  status: '' | SchoolAccessStatus;
}

/** Fehlercodes der Auth-/Datenschicht (UI übersetzt sie in Text). */
export type PortalErrorCode =
  | 'auth/user-not-found'
  | 'auth/user-disabled'
  | 'auth/not-activated'
  | 'permission-denied'
  | 'not-found'
  | 'invalid-argument';

export class PortalError extends Error {
  constructor(
    public readonly code: PortalErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'PortalError';
  }
}
