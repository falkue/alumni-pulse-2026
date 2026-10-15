/**
 * AppShell – Rahmen mit Seitenleiste (Desktop) bzw. Top-Navigation (Handy).
 * Zeigt Navigation, den eingeloggten User, DEMO-Badge und Abmelden-Button.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Badge } from './components/Badge';
import { DemoSwitcher } from './DemoSwitcher';
import { useSession } from './SessionContext';

export interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

export function AppShell({ nav, navLabel, children }: { nav: NavItem[]; navLabel: string; children: ReactNode }) {
  const { session, signOut } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);

  // Auf dem Handy ist die Navigation eine horizontale Leiste: Nach jedem
  // Seitenwechsel den aktiven Eintrag in den sichtbaren Bereich scrollen.
  useEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('.nav__link.active');
    // scrollIntoView fehlt in jsdom (Tests) -> optional aufrufen
    active?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [location.pathname]);

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        {/* Markenzeile im Circle-Stil: dunkles Quadrat mit Ring als Logo */}
        <div className="brand">
          <span className="brand__logo" aria-hidden="true" />
          <span className="brand__text">
            <span className="brand__title">Alumni Pulse 2026</span>
            <span className="brand__sub">ZHAW SML · FT · AACSB · BGS</span>
          </span>
        </div>
        <div className="sidebar__label" aria-hidden="true">{navLabel}</div>
        <nav className="nav" aria-label={navLabel} ref={navRef}>
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="nav__link">
              {item.label}
            </NavLink>
          ))}
        </nav>
        <DemoSwitcher />
        <div className="userbox">
          <div>
            <div className="row">
              <span className="userbox__name">{session?.displayName}</span>
              <Badge tone="demo">DEMO</Badge>
            </div>
            <div className="small muted">{session?.role === 'admin' ? 'Administration' : 'Institution'}</div>
          </div>
          <button type="button" className="btn btn--small" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
        {/* Fusszeile: Status-Punkt + Hinweis (lokale Demo, nur synthetische Daten) */}
        <div className="sidebar__status small">
          <span className="status-dot" aria-hidden="true" />
          Local demo · synthetic data
        </div>
      </aside>
      <main className="main">
        <div className="main__inner">{children}</div>
      </main>
    </div>
  );
}
