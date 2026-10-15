/**
 * App-Wurzel. `App` bündelt Services + Session; `AppRoutes` enthält nur die Routen.
 * Den Router (BrowserRouter bzw. MemoryRouter in Tests) setzt der Aufrufer
 * ausserhalb von `App`.
 */
import { Route, Routes } from 'react-router-dom';
import { AdminLayout } from './ui/admin/AdminLayout';
import { AdminSchoolDetailPage } from './ui/admin/AdminSchoolDetailPage';
import { AdminSchoolsPage } from './ui/admin/AdminSchoolsPage';
import { DemoEntry } from './ui/DemoEntry';
import { HomeRedirect, RequireRole } from './ui/Guards';
import { LoginPage } from './ui/Login';
import { SchoolLayout } from './ui/school/SchoolLayout';
import { SchoolSectionPage } from './ui/school/SchoolSectionPage';
import { Navigate } from 'react-router-dom';
import { ServicesProvider, type Services } from './ui/ServicesContext';
import { SessionProvider } from './ui/SessionContext';

/**
 * Routentabelle: /login offen, /admin/* nur für Rolle admin, /school/* nur für Rolle school;
 * alles andere geht über HomeRedirect. Muss innerhalb eines Routers gerendert werden.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Nur lokale Demo: Direkt-Einstieg ohne Login-Seite, z. B. /demo/S001/demographics */}
      <Route path="/demo/:who?/:sectionId?" element={<DemoEntry />} />

      {/* Nur Rolle admin */}
      <Route element={<RequireRole role="admin" />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminSchoolsPage />} />
          <Route path="schools/:schoolId" element={<AdminSchoolDetailPage />} />
        </Route>
      </Route>

      {/* Nur Rolle school */}
      <Route element={<RequireRole role="school" />}>
        <Route path="/school" element={<SchoolLayout />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path=":sectionId" element={<SchoolSectionPage />} />
        </Route>
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

/** Services + Session + Routen (ohne Router). */
export function App({ services }: { services: Services }) {
  return (
    <ServicesProvider services={services}>
      <SessionProvider>
        <AppRoutes />
      </SessionProvider>
    </ServicesProvider>
  );
}
