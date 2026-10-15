/**
 * "Ports" = die Schnittstellen, über die die UI mit Auth und Daten spricht.
 *
 * Die UI kennt NUR diese Interfaces. Heute steckt dahinter ein lokaler
 * Adapter (localStorage, src/services/local/), später ein Firebase-Adapter
 * (Firebase Auth + Firestore, src/services/firebase/). Der Austausch passiert
 * an genau einer Stelle: src/services/index.ts.
 *
 * Alle Methoden sind async, damit sich lokale und Netzwerk-Implementierung
 * gleich anfühlen.
 */
import type { AgeOverview, AgeWaves } from '../domain/age';
import type { EmploymentOverview } from '../domain/employment';
import type { ChartInsight } from '../domain/insights';
import type { AccountStatus, Session, School, UserAccount } from '../domain/types';

export interface AuthService {
  /** Nur Demo: Liste der auswählbaren Demo-Accounts für den Login-Screen. */
  listDemoAccounts(): Promise<UserAccount[]>;
  /**
   * Login. Lokal: per uid (Demo-Auswahl). Firebase: E-Mail-Link/Passwort/SSO.
   * Wirft PortalError('auth/user-disabled') bzw. ('auth/not-activated').
   */
  signIn(uid: string): Promise<Session>;
  signOut(): Promise<void>;
  /** Aktuelle Sitzung (nach Reload wiederhergestellt) oder null. */
  currentSession(): Promise<Session | null>;
}

export interface DataService {
  /** Admin: alle Hochschulen. School-Rolle: wirft permission-denied. */
  listSchools(session: Session): Promise<School[]>;
  /** Eine Hochschule. School-Rolle nur die eigene, sonst permission-denied. */
  getSchool(session: Session, schoolId: string): Promise<School>;
  /** Admin: alle Accounts (optional gefiltert nach Hochschule). */
  listAccounts(session: Session, schoolId?: string): Promise<UserAccount[]>;
  /** Admin: Status setzen (active/disabled). Setzt updatedAt/updatedBy. */
  setAccountStatus(session: Session, uid: string, status: AccountStatus): Promise<UserAccount>;
  /** Admin: Account anlegen (Status 'invited', Einladung nur als Mock). */
  inviteAccount(
    session: Session,
    input: { schoolId: string; email: string; displayName: string },
  ): Promise<UserAccount>;
  /**
   * Frage 1 (Alter), Stand 2026: eigene Werte + Benchmarks mit anonymen Peers.
   * Nur eigene Hochschule (oder Admin). Lokal: aggregates/schools/<id>.json,
   * Firestore: aggregates/{schoolId}/sections/overview.
   */
  getAgeOverview(session: Session, schoolId: string): Promise<AgeOverview>;
  /**
   * Frage 1 (Alter), Wellen 2022–2026. Lokal: aggregates/waves_mock/<id>.json
   * (simuliert), Firestore: aggregates/{schoolId}/waves/{year}.
   */
  getAgeWaves(session: Session, schoolId: string): Promise<AgeWaves>;
  /**
   * Karriere Frage 1 (Erwerbsstatus) für das Sankey-Diagramm: eigene Werte + Benchmarks.
   * Nur eigene Hochschule (oder Admin). Lokal: aggregates/schools/<id>.json,
   * Firestore: aggregates/{schoolId}/sections/career_salary.
   */
  getEmploymentFlow(session: Session, schoolId: string): Promise<EmploymentOverview>;
  /**
   * KI-Interpretation eines Diagramms für die eigene Hochschule (oder null, wenn keine vorliegt).
   * Prototyp: mit Claude erzeugte Texte (portal/insights/<chartId>/texts/<id>.json).
   * Später: automatisch im Backend mit Gemini, Firestore aggregates/{schoolId}/insights/{chartId}.
   */
  getChartInsight(session: Session, schoolId: string, chartId: string): Promise<ChartInsight | null>;
  /** Nur Demo: lokalen Zustand auf Seed zurücksetzen. */
  resetDemoData?(): Promise<void>;
}

/** Quelle für KI-Interpretationen (lokaler Adapter): Roh-JSON oder null, wenn keine vorliegt. */
export type InsightSource = (chartId: string, schoolId: string) => Promise<unknown | null>;

/**
 * Quelle für aggregierte JSON-Dokumente (lokaler Adapter).
 * Liefert das Roh-Dokument EINER Hochschule oder wirft PortalError('not-found').
 */
export type AggregateKind = 'schools' | 'waves_mock';
export type AggregateSource = (kind: AggregateKind, schoolId: string) => Promise<unknown>;
