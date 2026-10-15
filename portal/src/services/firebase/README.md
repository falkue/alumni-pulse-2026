# Firebase-Adapter (Entwurf)

> **Status: Entwurf.** Noch nicht aktiv, nicht kompiliert, nicht deployt. Das Paket `firebase`
> ist noch nicht installiert. Der lokale Adapter (`src/services/local/`) bleibt bis zur Migration
> die einzige laufende Implementierung.

## Inhalt

| Datei | Zweck |
|---|---|
| `firebaseAdapter.skeleton.ts.txt` | Skizze von `createFirebaseServices()`: implementiert `AuthService` und `DataService` aus `src/services/ports.ts` mit `firebase/auth`, `firebase/firestore`, `firebase/functions`. Endung `.txt`, damit `tsc`/Vitest die Datei ignorieren. |

## Aufbau der Skizze

- **Konfiguration** aus `import.meta.env.VITE_FIREBASE_*`; optional Emulatoren
  (`VITE_FIREBASE_USE_EMULATORS=true`).
- **Mapping** Firestore ↔ Domäne an genau einer Stelle:
  - `toIso()` / `fromIso()`: `Timestamp` ↔ ISO-8601-String (Domäne nutzt Strings).
  - `toUserAccount()`, `toSchool()`: Dokument-ID wird zu `uid` bzw. `schoolId`.
  - `toPortalError()`: `FirebaseError`-Codes → `PortalErrorCode`.
- **Auth**
  - `signIn()`: E-Mail-Link (Phase 2, Link in der URL) oder SSO (`'sso'` → OIDC/SAML-Provider
    aus Identity Platform, z. B. SWITCH edu-ID). Phase 1 (Link versenden) ist
    `sendLoginLink(email)` – **nicht im Port**, siehe offene Fragen.
  - `currentSession()`: wartet auf `onAuthStateChanged`, liest `getIdTokenResult().claims`
    (`role`, `schoolId`) und prüft `users/{uid}.status` mit `canSignIn()` aus der Domäne.
  - `listDemoAccounts()`: wirft – gibt es nur im Demo-Backend.
- **Daten**
  - `listSchools`, `getSchool`, `listAccounts`: einfache Lesezugriffe; Domänen-Checks
    (`assertAdmin`, `assertCanReadSchool`) zusätzlich zu den Security Rules.
  - `setAccountStatus`: `writeBatch` mit `users/{uid}`-Update (`serverTimestamp()`) und
    `auditLog`-Eintrag. Alternative: Callable Function `setAccountStatus`.
  - `inviteAccount`: immer Callable Function `inviteAccount` (braucht Admin SDK).
  - `resetDemoData`: nicht implementiert (optional im Port).

## Aktivierung

Schritt-für-Schritt in [`docs/FIREBASE_MIGRATION.md`](../../../docs/FIREBASE_MIGRATION.md).
Datenmodell und Claims-Synchronisation in [`docs/DATA_MODEL.md`](../../../docs/DATA_MODEL.md).

## Offene Punkte für den Port-Vertrag

1. `signIn(uid)` passt nicht zu E-Mail-Link/SSO. Vorschlag: Port um
   `sendLoginLink(email)` und `completeSignIn(): Promise<Session | null>` erweitern
   (lokaler Adapter: No-op bzw. Demo-Auswahl).
2. Kennzahlen/Benchmarks/Reports haben noch keinen Port. Vorschlag `AnalyticsService`
   (am Ende der Skizze).
3. `PortalErrorCode` hat keinen Code für „nicht unterstützt“; `listDemoAccounts` wirft
   deshalb `permission-denied`.
