/**
 * Admin-Übersicht (/admin): Kennzahlen + Liste ALLER Hochschulen mit Suche und Filtern.
 * Die Filterlogik steckt ausschliesslich in domain/schools (filterSchools).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { emptyFilter, filterOptions, filterSchools, groupAccountsBySchool, schoolAccessStatus } from '../../domain/schools';
import type { School, SchoolFilter, UserAccount } from '../../domain/types';
import { AccessStatusBadge, Badge } from '../components/Badge';
import { errorMessage, formatNumber, institutionTypeLabel } from '../format';
import { Loading } from '../Guards';
import { useServices } from '../ServicesContext';
import { useSession } from '../SessionContext';

/**
 * Admin-Seite: KPI-Kacheln (Accounts nach Status, Befragte) und gefilterte Hochschulliste.
 * Lädt Hochschulen und Accounts einmalig; Filter wirken nur im Browser-State.
 */
export function AdminSchoolsPage() {
  const { data } = useServices();
  const { session } = useSession();
  const navigate = useNavigate();
  const [schools, setSchools] = useState<School[] | null>(null);
  // Demo-Einträge (z. B. "ALL" = alle Hochschulen gepoolt) – getrennt, zählen nicht mit
  const [demoSchools, setDemoSchools] = useState<School[]>([]);
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [filter, setFilter] = useState<SchoolFilter>(emptyFilter());
  const [error, setError] = useState<string | null>(null);

  // Schritt 1: Hochschulen und Accounts laden
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    Promise.all([data.listSchools(session), data.listAccounts(session)])
      .then(([s, a]) => {
        if (cancelled) return;
        // Echte Hochschulen und Demo-Sichten trennen
        setSchools(s.filter((x) => !x.isDemo));
        setDemoSchools(s.filter((x) => x.isDemo));
        setAccounts(a);
      })
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [data, session]);

  // Kennzahlen nur über Accounts echter Hochschulen (Demo-Accounts ausgenommen)
  const schoolAccounts = useMemo(() => {
    const demoIds = new Set(demoSchools.map((d) => d.schoolId));
    return accounts.filter((a) => a.role === 'school' && !demoIds.has(a.schoolId ?? ''));
  }, [accounts, demoSchools]);
  const options = useMemo(() => filterOptions(schools ?? []), [schools]);
  const byId = useMemo(() => groupAccountsBySchool(accounts), [accounts]);
  // Schritt 2: Filter anwenden (nur über filterSchools)
  const visible = useMemo(() => filterSchools(schools ?? [], accounts, filter), [schools, accounts, filter]);

  const stats = useMemo(
    () => ({
      active: schoolAccounts.filter((a) => a.status === 'active').length,
      disabled: schoolAccounts.filter((a) => a.status === 'disabled').length,
      invited: schoolAccounts.filter((a) => a.status === 'invited').length,
      respondents: (schools ?? []).reduce((sum, s) => sum + s.nRespondents, 0),
    }),
    [schoolAccounts, schools],
  );

  function update(patch: Partial<SchoolFilter>) {
    setFilter((f) => ({ ...f, ...patch }));
  }

  if (error) return <div className="alert alert--error" role="alert">{error}</div>;
  if (!schools) return <Loading />;

  return (
    <>
      <header className="page-head">
        <h1><em>Institutions</em></h1>
        <p className="muted">All participating institutions and their access status.</p>
      </header>

      <section aria-label="Key figures" className="grid grid--kpi">
        <Kpi label="Total institutions" value={formatNumber(schools.length)} />
        <Kpi label="Active accounts" value={formatNumber(stats.active)} />
        <Kpi label="Disabled accounts" value={formatNumber(stats.disabled)} />
        <Kpi label="Invited accounts" value={formatNumber(stats.invited)} />
        <Kpi label="Total respondents (n)" value={formatNumber(stats.respondents)} />
      </section>

      <section className="card" aria-label="Institution list">
        <div className="filters" role="search">
          <div className="field">
            <label htmlFor="f-query">Search</label>
            <input
              id="f-query"
              className="input"
              type="search"
              placeholder="Name, abbreviation, city or ID"
              value={filter.query}
              onChange={(e) => update({ query: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="f-region">Region</label>
            <select id="f-region" className="input" value={filter.region} onChange={(e) => update({ region: e.target.value })}>
              <option value="">All regions</option>
              {options.regions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-country">Country</label>
            <select id="f-country" className="input" value={filter.country} onChange={(e) => update({ country: e.target.value })}>
              <option value="">All countries</option>
              {options.countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-status">Access status</label>
            <select
              id="f-status"
              className="input"
              value={filter.status}
              onChange={(e) => update({ status: e.target.value as SchoolFilter['status'] })}
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="partial">Partial</option>
              <option value="none">No access</option>
            </select>
          </div>
        </div>

        <p role="status" aria-live="polite" className="muted small" data-testid="result-count">
          {visible.length} of {schools.length} institutions
        </p>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Name</th>
                <th scope="col">Country / city</th>
                <th scope="col">Region</th>
                <th scope="col">Type</th>
                <th scope="col">AACSB</th>
                <th scope="col">Ranking tier</th>
                <th scope="col" className="num">n</th>
                <th scope="col">Access</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.schoolId} className="clickable" onClick={() => navigate(`/admin/schools/${s.schoolId}`)}>
                  <td data-label="ID">{s.schoolId}</td>
                  <td data-label="Name">
                    <Link to={`/admin/schools/${s.schoolId}`} onClick={(e) => e.stopPropagation()}>
                      {s.name}
                    </Link>{' '}
                    <span className="muted small">({s.shortName})</span>
                  </td>
                  <td data-label="Country / city">{s.country}, {s.city}</td>
                  <td data-label="Region">{s.region}</td>
                  <td data-label="Type">{institutionTypeLabel(s.institutionType)}</td>
                  <td data-label="AACSB">{s.aacsb ? <Badge tone="accent">AACSB</Badge> : <span className="muted">–</span>}</td>
                  <td data-label="Ranking tier">{s.rankingTier}</td>
                  <td data-label="n" className="num">{formatNumber(s.nRespondents)}</td>
                  <td data-label="Access">
                    <AccessStatusBadge status={schoolAccessStatus(byId.get(s.schoolId) ?? [])} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <p className="muted">No institutions found.</p>}
        </div>
      </section>

      {/* Demo-Sichten: keine echten Hochschulen, nicht in Kennzahlen/Liste gezählt */}
      {demoSchools.length > 0 && (
        <section className="card" aria-label="Demo views">
          <h2>Demo <em>views</em></h2>
          <p className="muted small">
            Not real institutions and not counted above. They let you present the customer view with pooled data.
          </p>
          <ul className="demo-list">
            {demoSchools.map((d) => (
              <li key={d.schoolId} className="row row--between">
                <span>
                  <Badge tone="demo">DEMO</Badge>{' '}
                  <Link to={`/admin/schools/${d.schoolId}`}>{d.name}</Link>{' '}
                  <span className="muted small">({d.schoolId} · n = {formatNumber(d.nRespondents)})</span>
                </span>
                <AccessStatusBadge status={schoolAccessStatus(byId.get(d.schoolId) ?? [])} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/**
 * Einzelne Kennzahl-Kachel: grosser Wert `value` über der Beschriftung `label`.
 */
function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <div className="kpi__value">{value}</div>
      <div className="kpi__label">{label}</div>
    </div>
  );
}
