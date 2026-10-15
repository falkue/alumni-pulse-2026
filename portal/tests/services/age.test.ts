/**
 * Datenladen Frage 1 über den lokalen Adapter: Mandantentrennung VOR dem Laden,
 * Mapping, Fehlerfälle und die URL-/Fetch-Hülle für den Dev-Server.
 */
import { createLocalServices } from '../../src/services/local/localData';
import { createMemoryStorage } from '../../src/services/local/storage';
import { aggregateUrl, fetchLocalAggregate, fetchLocalInsight, insightUrl } from '../../src/services/local/aggregates';
import type { AggregateKind } from '../../src/services/ports';
import type { School, UserAccount } from '../../src/domain/types';
import schoolsSeed from '../../seed/schools.json';
import usersSeed from '../../seed/users.json';
import { rawSchoolS001, rawWavesLateJoiner } from '../fixtures/age';

const code = (c: string) => expect.objectContaining({ code: c });

function make() {
  const loaded: Array<[AggregateKind, string]> = [];
  const svc = createLocalServices({
    storage: createMemoryStorage(),
    seedSchools: schoolsSeed as School[],
    seedUsers: usersSeed as UserAccount[],
    aggregates: async (kind, schoolId) => {
      loaded.push([kind, schoolId]);
      return kind === 'schools' ? { ...rawSchoolS001, school: { school_id: schoolId } } : { ...rawWavesLateJoiner, school_id: schoolId };
    },
  });
  return { ...svc, loaded };
}

describe('getAgeOverview / getAgeWaves', () => {
  it('Hochschule lädt die eigenen Aggregate (gemappt)', async () => {
    const { auth, data, loaded } = make();
    const s = await auth.signIn('u-S002');
    const o = await data.getAgeOverview(s, 'S002');
    expect(o).toMatchObject({ schoolId: 'S002', published: true });
    const w = await data.getAgeWaves(s, 'S002');
    expect(w.simulated).toBe(true);
    expect(loaded).toEqual([['schools', 'S002'], ['waves_mock', 'S002']]);
  });

  it('fremde Hochschule: permission-denied und es wird NICHTS geladen', async () => {
    const { auth, data, loaded } = make();
    const s = await auth.signIn('u-S002');
    await expect(data.getAgeOverview(s, 'S003')).rejects.toEqual(code('permission-denied'));
    await expect(data.getAgeWaves(s, 'S003')).rejects.toEqual(code('permission-denied'));
    expect(loaded).toEqual([]);
  });

  it('deaktivierte Sitzung lädt nichts mehr', async () => {
    const { auth, data, loaded } = make();
    const school = await auth.signIn('u-S002');
    const admin = await auth.signIn('admin-demo');
    await data.setAccountStatus(admin, 'u-S002', 'disabled');
    await expect(data.getAgeOverview(school, 'S002')).rejects.toEqual(code('permission-denied'));
    expect(loaded).toEqual([]);
  });

  it('Erwerbsstatus: eigene Hochschule ja, fremde nein (nichts geladen)', async () => {
    const { auth, data, loaded } = make();
    const s = await auth.signIn('u-S002');
    await expect(data.getEmploymentFlow(s, 'S003')).rejects.toEqual(code('permission-denied'));
    expect(loaded).toEqual([]);
    const o = await data.getEmploymentFlow(s, 'S002');
    expect(o.schoolId).toBe('S002');
    expect(loaded).toEqual([['schools', 'S002']]);
  });

  it('Admin darf jede Hochschule laden', async () => {
    const { auth, data } = make();
    const admin = await auth.signIn('admin-demo');
    expect((await data.getAgeOverview(admin, 'S040')).schoolId).toBe('S040');
  });

  it('ohne konfigurierte Quelle -> not-found', async () => {
    const svc = createLocalServices({ storage: createMemoryStorage(), seedSchools: schoolsSeed as School[], seedUsers: usersSeed as UserAccount[] });
    const s = await svc.auth.signIn('u-S002');
    await expect(svc.data.getAgeOverview(s, 'S002')).rejects.toEqual(code('not-found'));
  });
});

describe('getChartInsight (KI-Interpretation)', () => {
  const mk = () => {
    const asked: Array<[string, string]> = [];
    const svc = createLocalServices({
      storage: createMemoryStorage(),
      seedSchools: schoolsSeed as School[],
      seedUsers: usersSeed as UserAccount[],
      insights: async (chartId, schoolId) => {
        asked.push([chartId, schoolId]);
        return schoolId === 'S002' ? { school_id: 'S002', chart_id: 'career_employment_status', headline: 'H', how_to_read: 'R', key_findings: ['a'], benchmark: 'B', caveats: null, generated_by: { provider: 'Anthropic', model: 'claude-sonnet-5-5', mode: 'm' }, generated_at: '2026-10-15T10:00:00Z' } : null;
      },
    });
    return { ...svc, asked };
  };
  it('eigene Hochschule: Text gemappt; fehlender Text -> null', async () => {
    const { auth, data } = mk();
    const s = await auth.signIn('u-S002');
    expect((await data.getChartInsight(s, 'S002', 'career_employment'))!.headline).toBe('H');
    const admin = await auth.signIn('admin-demo');
    expect(await data.getChartInsight(admin, 'S003', 'career_employment')).toBeNull();
  });
  it('fremde Hochschule: permission-denied, nichts angefragt', async () => {
    const { auth, data, asked } = mk();
    const s = await auth.signIn('u-S002');
    await expect(data.getChartInsight(s, 'S003', 'career_employment')).rejects.toEqual(code('permission-denied'));
    expect(asked).toEqual([]);
  });
  it('ohne Quelle -> null', async () => {
    const svc = createLocalServices({ storage: createMemoryStorage(), seedSchools: schoolsSeed as School[], seedUsers: usersSeed as UserAccount[] });
    const s = await svc.auth.signIn('u-S002');
    expect(await svc.data.getChartInsight(s, 'S002', 'career_employment')).toBeNull();
  });
  it('insightUrl/fetchLocalInsight: nur gültige IDs, 404 -> null', async () => {
    expect(insightUrl('career_employment', 'S001')).toBe('/local-insights/career_employment/S001.json');
    expect(() => insightUrl('../x', 'S001')).toThrow();
    expect(() => insightUrl('career_employment', 'S01')).toThrow();
    const res = (status: number) => (async () => new Response('{}', { status })) as unknown as typeof fetch;
    expect(await fetchLocalInsight('career_employment', 'S001', res(404))).toBeNull();
    expect(await fetchLocalInsight('career_employment', 'S001', res(200))).toEqual({});
  });
});

describe('fetchLocalAggregate', () => {
  it('baut nur gültige URLs (keine Pfad-Tricks)', () => {
    expect(aggregateUrl('schools', 'S001')).toBe('/local-aggregates/schools/S001.json');
    expect(aggregateUrl('waves_mock', 'S050')).toBe('/local-aggregates/waves_mock/S050.json');
    expect(aggregateUrl('schools', 'ALL')).toBe('/local-aggregates/schools/ALL.json');
    expect(() => aggregateUrl('schools', 'ALL2')).toThrow();
    expect(() => aggregateUrl('schools', '../S001')).toThrow();
    expect(() => aggregateUrl('schools', 'S1')).toThrow();
  });

  it('200 -> JSON, 404 -> not-found, 500 -> Fehler', async () => {
    const res = (status: number, body: unknown) =>
      (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    expect(await fetchLocalAggregate('schools', 'S001', res(200, { n: 1 }))).toEqual({ n: 1 });
    await expect(fetchLocalAggregate('schools', 'S001', res(404, {}))).rejects.toEqual(code('not-found'));
    await expect(fetchLocalAggregate('schools', 'S001', res(500, {}))).rejects.toThrow(/HTTP 500/);
  });
});
