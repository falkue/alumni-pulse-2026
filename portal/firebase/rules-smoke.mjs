// ENTWURF – Rules-Smoke-Test ohne npm-Abhängigkeiten (Node >= 18, globales fetch).
// Spricht Firestore- und Storage-Emulator per REST an, mit unsignierten Test-Tokens.
// Aufruf (aus portal/, nachdem firebase.json dorthin kopiert wurde, Migration Schritt 3):
//   firebase emulators:exec --project demo-alumni-pulse --only firestore,storage "node firebase/rules-smoke.mjs"
// Ersetzt nicht die Test-Suite mit @firebase/rules-unit-testing (docs/FIREBASE_MIGRATION.md).

const P = 'demo-alumni-pulse';
const FS = `http://127.0.0.1:8080/v1/projects/${P}/databases/(default)/documents`;
const ST = `http://127.0.0.1:9199/v0/b/${P}.appspot.com/o`;
let fail = 0;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(uid, claims = {}) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    iss: `https://securetoken.google.com/${P}`, aud: P, auth_time: now, iat: now, exp: now + 3600,
    sub: uid, user_id: uid, firebase: { sign_in_provider: 'password', identities: {} }, ...claims,
  })}.`;
}
const val = (v) => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? { integerValue: String(v) } : v instanceof Date ? { timestampValue: v.toISOString() }
  : typeof v === 'object' ? { mapValue: { fields: fields(v) } } : { stringValue: v };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
async function req(method, url, auth, body) {
  const r = await fetch(url, { method, headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.status;
}
const put = (path, data) => req('PATCH', `${FS}/${path}`, 'owner', { fields: fields(data) });
function expect(name, status, ok) {
  const allowed = status === 200;
  const pass = allowed === ok;
  if (!pass) fail++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${ok ? 'erlaubt ' : 'verboten'}  (${status})  ${name}`);
}
const T0 = new Date('2026-10-01T08:00:00Z');
const user = (uid, role, schoolId, status) => ({ uid, email: `${uid}@x.example`, displayName: uid, role, schoolId, status, createdAt: T0, updatedAt: T0, updatedBy: null });

// Seed
await put('users/admin', user('admin', 'admin', null, 'active'));
await put('users/admin2', user('admin2', 'admin', null, 'active'));
await put('users/a1', user('a1', 'school', 'S001', 'active'));
await put('users/i1', user('i1', 'school', 'S001', 'invited'));
await put('users/d1', user('d1', 'school', 'S001', 'disabled'));
await put('users/a2', user('a2', 'school', 'S002', 'active'));
await put('schools/S001', { schoolId: 'S001', name: 'One' });
await put('schools/S002', { schoolId: 'S002', name: 'Two' });
await put('aggregates/S001/sections/overview', { schoolId: 'S001', n: 28 });
await put('benchmarks/region__europe__overview', { publishable: true, n: 400 });
await put('benchmarks/region__x__overview', { publishable: false, n: 3 });
await put('reports/S001', { storagePath: 'reports/S001/r.pdf' });
await put('reports/S002', { storagePath: 'reports/S002/r.pdf' });

const ADM = token('admin', { role: 'admin', schoolId: null });
const A1 = token('a1', { role: 'school', schoolId: 'S001' });
const A1stale = token('a1', { role: 'school', schoolId: 'S002' }); // Claim passt nicht zum Dokument
const I1 = token('i1', { role: 'school', schoolId: 'S001' });
const D1 = token('d1', { role: 'school', schoolId: 'S001' }); // noch gültiges Token nach Sperre
const FAKEADM = token('a2', { role: 'admin' }); // Claim admin, Dokument school
const NOCLAIM = token('a1');

expect('Admin liest fremde Schule', await req('GET', `${FS}/schools/S002`, ADM), true);
expect('Admin listet Schulen', await req('GET', `${FS}/schools`, ADM), true);
expect('School liest eigene Schule', await req('GET', `${FS}/schools/S001`, A1), true);
expect('School liest fremde Schule', await req('GET', `${FS}/schools/S002`, A1), false);
expect('School listet alle Schulen', await req('GET', `${FS}/schools`, A1), false);
expect('Claim schoolId weicht vom Dokument ab', await req('GET', `${FS}/schools/S002`, A1stale), false);
expect('Ohne Claims', await req('GET', `${FS}/schools/S001`, NOCLAIM), false);
expect('Invited liest eigene Schule', await req('GET', `${FS}/schools/S001`, I1), false);
expect('Disabled (altes Token) liest eigene Schule', await req('GET', `${FS}/schools/S001`, D1), false);
expect('Gefälschter Admin-Claim', await req('GET', `${FS}/schools`, FAKEADM), false);
expect('Unangemeldet liest Schule', (await fetch(`${FS}/schools/S001`)).status, false);
expect('School schreibt Schule', await req('PATCH', `${FS}/schools/S001`, A1, { fields: fields({ name: 'X' }) }), false);
expect('Admin schreibt Schule', await req('PATCH', `${FS}/schools/S001`, ADM, { fields: fields({ name: 'X' }) }), false);
expect('School liest eigene Aggregate', await req('GET', `${FS}/aggregates/S001/sections/overview`, A1), true);
expect('School liest fremde Aggregate', await req('GET', `${FS}/aggregates/S002/sections/overview`, A1), false);
expect('Admin schreibt Aggregate', await req('PATCH', `${FS}/aggregates/S001/sections/overview`, ADM, { fields: fields({ n: 1 }) }), false);
expect('School liest publizierbaren Benchmark', await req('GET', `${FS}/benchmarks/region__europe__overview`, A1), true);
expect('School liest unterdrückten Benchmark', await req('GET', `${FS}/benchmarks/region__x__overview`, A1), false);
expect('Invited liest Benchmark', await req('GET', `${FS}/benchmarks/region__europe__overview`, I1), false);
expect('School liest eigenen Report', await req('GET', `${FS}/reports/S001`, A1), true);
expect('School liest fremden Report', await req('GET', `${FS}/reports/S002`, A1), false);
function A2tok() { return token('a2', { role: 'school', schoolId: 'S002' }); }
expect('User liest eigenes Dokument (invited)', await req('GET', `${FS}/users/i1`, I1), true);
expect('School liest fremdes User-Dokument', await req('GET', `${FS}/users/a2`, A1), false);
expect('Admin liest User', await req('GET', `${FS}/users/a2`, ADM), true);
expect('School listet Users', await req('GET', `${FS}/users`, A1), false);

// Statuswechsel per Commit (Batch)
const doc = (p) => `projects/${P}/databases/(default)/documents/${p}`;
function statusWrite(uid, status, by, extra = {}) {
  return {
    update: { name: doc(`users/${uid}`), fields: fields({ status, updatedBy: by, ...extra }) },
    updateMask: { fieldPaths: ['status', 'updatedBy', ...Object.keys(extra)] },
    updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
    currentDocument: { exists: true },
  };
}
function auditWrite(id, e) {
  return {
    update: { name: doc(`auditLog/${id}`), fields: fields({ type: 'account.status_changed', actorUid: 'admin', ...e }) },
    updateTransforms: [{ fieldPath: 'at', setToServerValue: 'REQUEST_TIME' }],
    currentDocument: { exists: false },
  };
}
const commit = (auth, writes) => req('POST', `${FS}:commit`, auth, { writes });

expect('Admin aktiviert invited + Audit im Batch', await commit(ADM, [
  statusWrite('i1', 'active', 'admin'),
  auditWrite('e1', { targetUid: 'i1', targetSchoolId: 'S001', fromStatus: 'invited', toStatus: 'active' }),
]), true);
expect('Admin deaktiviert (ohne Audit)', await commit(ADM, [statusWrite('a2', 'disabled', 'admin')]), true);
expect('Status "invited" setzen', await commit(ADM, [statusWrite('a2', 'invited', 'admin')]), false);
expect('Ungültiger Status', await commit(ADM, [statusWrite('a2', 'banana', 'admin')]), false);
expect('updatedBy falsch', await commit(ADM, [statusWrite('a2', 'active', 'someone')]), false);
expect('Rolle mitändern', await commit(ADM, [statusWrite('a2', 'active', 'admin', { role: 'admin' })]), false);
expect('schoolId mitändern', await commit(ADM, [statusWrite('a2', 'active', 'admin', { schoolId: 'S001' })]), false);
expect('Admin deaktiviert sich selbst', await commit(ADM, [statusWrite('admin', 'disabled', 'admin')]), false);
expect('Admin deaktiviert anderen Admin', await commit(ADM, [statusWrite('admin2', 'disabled', 'admin')]), true);
expect('School ändert eigenen Status', await commit(A1, [statusWrite('a1', 'active', 'a1')]), false);
expect('Client-Zeit statt serverTimestamp', await req('PATCH',
  `${FS}/users/a2?updateMask.fieldPaths=status&updateMask.fieldPaths=updatedBy&updateMask.fieldPaths=updatedAt`, ADM,
  { fields: fields({ status: 'active', updatedBy: 'admin', updatedAt: new Date() }) }), false);
expect('Audit ohne passendes User-Update', await commit(ADM, [
  auditWrite('e2', { targetUid: 'a1', targetSchoolId: 'S001', fromStatus: 'active', toStatus: 'disabled' }),
]), false);
expect('Audit mit falschem fromStatus', await commit(ADM, [
  statusWrite('a1', 'disabled', 'admin'),
  auditWrite('e3', { targetUid: 'a1', targetSchoolId: 'S001', fromStatus: 'invited', toStatus: 'disabled' }),
]), false);
expect('Audit mit Zusatzfeld', await commit(ADM, [
  statusWrite('a1', 'disabled', 'admin'),
  auditWrite('e4', { targetUid: 'a1', targetSchoolId: 'S001', fromStatus: 'active', toStatus: 'disabled', note: 'x' }),
]), false);
expect('Audit ändern', await req('PATCH', `${FS}/auditLog/e1`, ADM, { fields: fields({ type: 'x' }) }), false);
expect('Audit löschen', await req('DELETE', `${FS}/auditLog/e1`, ADM), false);
expect('Admin legt User an', await req('PATCH', `${FS}/users/new1`, ADM, { fields: fields(user('new1', 'school', 'S001', 'invited')) }), false);
expect('Admin löscht User', await req('DELETE', `${FS}/users/a1`, ADM), false);
expect('Unbekannte Collection', await req('GET', `${FS}/foo/bar`, ADM), false);

// Storage
const up = await fetch(`${ST}?name=${encodeURIComponent('reports/S001/r.pdf')}&uploadType=media`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/pdf' }, body: '%PDF-1.4' });
console.log('storage seed upload', up.status);
const sget = (path, auth) => req('GET', `${ST}/${encodeURIComponent(path)}?alt=media`, auth);
expect('Storage: School liest eigenen Report', await sget('reports/S001/r.pdf', A1), true);
expect('Storage: Admin liest Report', await sget('reports/S001/r.pdf', ADM), true);
expect('Storage: fremde Schule liest Report', await sget('reports/S001/r.pdf', A2tok()), false);
expect('Storage: disabled liest Report', await sget('reports/S001/r.pdf', D1), false);
const sup = await fetch(`${ST}?name=${encodeURIComponent('reports/S001/x.pdf')}&uploadType=media`, { method: 'POST', headers: { Authorization: `Bearer ${ADM}`, 'Content-Type': 'application/pdf' }, body: '%PDF' });
expect('Storage: Admin-Client lädt hoch', sup.status, false);

console.log(fail ? `\n${fail} FEHLER` : '\nALLE TESTS OK');
process.exit(fail ? 1 : 0);
