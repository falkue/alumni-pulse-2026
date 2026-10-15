/**
 * DIE Austauschstelle: Die UI importiert `auth` und `data` ausschließlich von hier.
 *
 * Umschalten auf Firebase (später): einen Adapter in src/services/firebase/ bauen, der
 * AuthService/DataService aus ports.ts implementiert, und hier z. B. so wählen:
 *
 *   const useFirebase = import.meta.env.VITE_BACKEND === 'firebase';
 *   export const { auth, data } = useFirebase ? createFirebaseServices() : createLocalServices(...);
 *
 * Ändert sich sonst nichts an der UI. IS_DEMO_BACKEND steuert z. B. den Demo-Hinweis.
 */
import schoolsSeed from '../../seed/schools.json';
import usersSeed from '../../seed/users.json';
import type { School, UserAccount } from '../domain/types';
import { fetchLocalAggregate, fetchLocalInsight } from './local/aggregates';
import { createLocalServices } from './local/localData';

const services = createLocalServices({
  seedSchools: schoolsSeed as School[],
  seedUsers: usersSeed as UserAccount[],
  // Aggregate kommen vom lokalen Dev-Server (vite.config.ts, Plugin localAggregates)
  aggregates: fetchLocalAggregate,
  // KI-Interpretationen (Prototyp: mit Claude erzeugt) ebenfalls vom Dev-Server
  insights: fetchLocalInsight,
});

export const auth = services.auth;
export const data = services.data;
export const IS_DEMO_BACKEND = true;
