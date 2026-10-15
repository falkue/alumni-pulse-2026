/**
 * Hochschul-Detail (/admin/schools/:schoolId): Stammdaten, Accounts mit
 * Statuswechsel und Formular "Account einladen (Mock)".
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AccountStatus, School, UserAccount } from '../../domain/types';
import { AccessStatusBadge, AccountStatusBadge, Badge } from '../components/Badge';
import { errorMessage, formatDateTime, formatNumber, institutionTypeLabel } from '../format';
import { Loading } from '../Guards';
import { useServices } from '../ServicesContext';
import { useSession } from '../SessionContext';
import { schoolAccessStatus } from '../../domain/schools';

/**
 * Admin-Detailseite einer Hochschule (schoolId aus der URL): Stammdaten, Accounts,
 * Statuswechsel und Einladungsformular. Nach jeder Änderung werden die Daten neu geladen.
 */
export function AdminSchoolDetailPage() {
  const { schoolId = '' } = useParams();
  const { data } = useServices();
  const { session } = useSession();
  const [school, setSchool] = useState<School | null>(null);
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  // Lädt Hochschule + Accounts (auch nach jeder Änderung)
  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [s, a] = await Promise.all([data.getSchool(session, schoolId), data.listAccounts(session, schoolId)]);
      setSchool(s);
      setAccounts(a);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [data, session, schoolId]);

  useEffect(() => {
    load();
  }, [load]);

  // Status ändern, danach neu laden; Fehler anzeigen
  async function changeStatus(uid: string, status: AccountStatus) {
    if (!session) return;
    setActionError(null);
    try {
      await data.setAccountStatus(session, uid, status);
      await load();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    setActionError(null);
    setNotice(null);
    try {
      await data.inviteAccount(session, { schoolId, email: email.trim(), displayName: name.trim() });
      setEmail('');
      setName('');
      setNotice('Account created (status: invited). No email was sent.');
      await load();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function reset() {
    if (!data.resetDemoData) return;
    if (!window.confirm('Reset all demo data to its initial state?')) return;
    setActionError(null);
    try {
      await data.resetDemoData();
      await load();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  if (error) {
    return (
      <>
        <Link to="/admin">← Back to list</Link>
        <div className="alert alert--error" role="alert">{error}</div>
      </>
    );
  }
  if (!school) return <Loading />;

  return (
    <>
      <Link to="/admin">← Back to list</Link>
      <header className="page-head">
        <div className="row">
          <h1>{school.name}</h1>
          {school.isDemo && <Badge tone="demo">DEMO</Badge>}
          <AccessStatusBadge status={schoolAccessStatus(accounts)} />
        </div>
        <p className="muted">{school.schoolId} · {school.shortName}</p>
      </header>

      <section className="card" aria-labelledby="stamm">
        <h2 id="stamm">Institution details</h2>
        <dl className="dl">
          {/* Leere Stammdaten (z. B. Demo-Sicht "ALL") werden ausgeblendet */}
          <Item label="Country" value={school.country} />
          <Item label="City" value={school.city} />
          <Item label="Region" value={school.subregion ? `${school.region} (${school.subregion})` : school.region} />
          {!school.isDemo && <Item label="Type" value={institutionTypeLabel(school.institutionType)} />}
          <Item label="Ranking tier" value={school.rankingTier ? String(school.rankingTier) : ''} />
          <Item label="Founded" value={school.foundedYear ? String(school.foundedYear) : ''} />
          <Item label="Alumni base" value={school.alumniBaseSize ? formatNumber(school.alumniBaseSize) : ''} />
          <Item label="Respondents (n)" value={formatNumber(school.nRespondents)} />
          <Item label="Currency" value={school.currency} />
        </dl>
        <div className="row">
          {school.aacsb && <Badge tone="accent">AACSB</Badge>}
          {school.equis && <Badge tone="accent">EQUIS</Badge>}
          {school.bgsChapter && <Badge tone="accent">Beta Gamma Sigma</Badge>}
        </div>
        {school.notes && <p className="muted small">{school.notes}</p>}
      </section>

      {actionError && <div className="alert alert--error" role="alert">{actionError}</div>}

      <section className="card" aria-labelledby="accounts">
        <h2 id="accounts"><em>Accounts</em></h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Status</th>
                <th scope="col">Last changed</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.uid}>
                  <td data-label="Name">{a.displayName}</td>
                  <td data-label="Email">{a.email}</td>
                  <td data-label="Status"><AccountStatusBadge status={a.status} /></td>
                  <td data-label="Last changed">
                    {formatDateTime(a.updatedAt)}
                    {a.updatedBy ? <span className="muted small"> by {a.updatedBy}</span> : null}
                  </td>
                  <td data-label="Action">
                    {a.status === 'active' ? (
                      <button type="button" className="btn btn--small btn--danger" onClick={() => changeStatus(a.uid, 'disabled')}>
                        Deactivate
                      </button>
                    ) : (
                      <button type="button" className="btn btn--small btn--primary" onClick={() => changeStatus(a.uid, 'active')}>
                        Activate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {accounts.length === 0 && <p className="muted">No accounts yet.</p>}
        </div>
      </section>

      <section className="card" aria-labelledby="invite">
        <h2 id="invite">Invite account (mock)</h2>
        <form onSubmit={invite} className="filters" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div className="field">
            <label htmlFor="inv-email">Email</label>
            <input id="inv-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="inv-name">Name</label>
            <input id="inv-name" className="input" type="text" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn--primary">Invite</button>
          </div>
        </form>
        <p className="muted small">No email will be sent.</p>
        {notice && <div className="alert alert--info" role="status">{notice}</div>}
      </section>

      {data.resetDemoData && (
        <div>
          <button type="button" className="btn btn--small btn--danger" onClick={reset}>
            Reset demo data
          </button>
        </div>
      )}
    </>
  );
}

/**
 * Eintrag einer Definitionsliste (<dt>/<dd>): Beschriftung `label` mit Wert `value`.
 */
function Item({ label, value }: { label: string; value: string }) {
  // Leere Werte gar nicht erst anzeigen
  if (!value) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
