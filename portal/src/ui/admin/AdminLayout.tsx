/** Rahmen der Admin-Sicht (/admin/*): Sidebar mit Navigation + Unterseiten. */
import { Outlet } from 'react-router-dom';
import { AppShell } from '../AppShell';

/**
 * Layout der Admin-Sicht: AppShell mit Navigation ("Hochschulen") und Outlet für die Unterseiten.
 */
export function AdminLayout() {
  return (
    <AppShell navLabel="Admin navigation" nav={[{ to: '/admin', label: 'Institutions' }]}>
      <Outlet />
    </AppShell>
  );
}
