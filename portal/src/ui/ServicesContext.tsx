/**
 * ServicesContext – reicht Auth- und Daten-Service an alle UI-Komponenten weiter.
 *
 * Komponenten importieren die Services nie direkt, sondern nutzen `useServices()`.
 * So können Tests In-Memory-Fakes einspeisen, und der Austausch gegen Firebase
 * bleibt an einer Stelle (src/services/index.ts, verdrahtet in main.tsx).
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { AuthService, DataService } from '../services/ports';

export interface Services {
  auth: AuthService;
  data: DataService;
  /**
   * Nur lokale Demo: Direkt-Links /demo/... und Ansichts-Umschalter in der Seitenleiste.
   * Mit dem Firebase-Backend immer false (dort gibt es keinen Login ohne Anmeldung).
   */
  demoMode?: boolean;
}

const ServicesContext = createContext<Services | null>(null);

/** Stellt die Services bereit (Prop `services`). */
export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

/** Zugriff auf die Services; wirft, wenn kein Provider vorhanden ist. */
export function useServices(): Services {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error('ServicesProvider fehlt');
  return ctx;
}
