import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import type { DomainImportCatalog } from '../src/domainImportCatalog';
import type {
  AuthenticatedSession,
  DomainConfig,
  JsonObject,
  SessionVerifier,
  WhiteLabelRepository,
} from '../src/types';

const DOMAIN_ID = 34;
const audit = {
  createdBy: '1',
  updatedBy: '1',
  statusChangedBy: '1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  statusChangedAt: '2026-01-02T00:00:00.000Z',
};

function domainContent(
  overrides: JsonObject = {},
): JsonObject {
  return {
    name: '主站',
    theme: { primaryColor: '#409eff' },
    logoUrl: 'https://cdn.example/logo.webp',
    ...overrides,
  };
}

function domain(overrides: Partial<DomainConfig> = {}): DomainConfig {
  return {
    domainId: DOMAIN_ID,
    configKey: 'dev.xrugc.com',
    displayName: 'XR UGC Dev',
    schemaVersion: 1,
    revision: 3,
    config: domainContent(),
    enabled: true,
    ...audit,
    ...overrides,
  };
}

function publicSnapshot(overrides: JsonObject = {}) {
  return domainContent(overrides);
}

function catalogFor(
  configKey = 'dev.xrugc.com',
  config: JsonObject = domainContent(),
): DomainImportCatalog {
  return {
    list: vi.fn().mockResolvedValue({
      source: 'fixed',
      items: [{
        configKey,
        description: 'XR UGC Dev',
        isActive: true,
        selectable: true,
      }],
    }),
  };
}

function repository(overrides: Partial<WhiteLabelRepository> = {}): WhiteLabelRepository {
  return {
    health: vi.fn().mockResolvedValue(undefined),
    listDomainConfigs: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    createDomainConfig: vi.fn().mockResolvedValue(domain({ revision: 1, enabled: false })),
    findDomainConfig: vi.fn().mockResolvedValue(domain()),
    findFirstDomainConfig: vi.fn().mockResolvedValue(domain()),
    updateDomainConfig: vi.fn().mockResolvedValue({
      kind: 'updated',
      value: domain({ revision: 4 }),
    }),
    setDomainConfigEnabled: vi.fn().mockResolvedValue({
      kind: 'updated',
      value: domain({ revision: 4 }),
    }),
    ...overrides,
  };
}

function verifier(session: AuthenticatedSession): SessionVerifier {
  return { verify: vi.fn().mockResolvedValue(session) };
}

const adminSession = (): AuthenticatedSession => ({ userId: '8', roles: ['admin'] });
const rootSession = (): AuthenticatedSession => ({ userId: '1', roles: ['root'] });

function app(
  repo: WhiteLabelRepository,
  session: AuthenticatedSession = rootSession(),
  domainImportCatalog?: DomainImportCatalog,
) {
  return createApp({
    repository: repo,
    sessionVerifier: verifier(session),
    domainImportCatalog,
  });
}

describe('domain-only white-label backend', () => {
  it('reports database readiness', async () => {
    const response = await request(app(repository())).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      service: 'plugin-whitelabel-backend',
    });
  });

  it('resolves a public config by hostname without organization or database id', async () => {
    const repo = repository();
    const response = await request(app(repo))
      .get('/v1/white-label-configs')
      .query({ domain: 'dev.xrugc.com' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(publicSnapshot());
    expect(response.body).not.toHaveProperty('organization');
    expect(response.body).not.toHaveProperty('domainId');
    expect(response.headers['cache-control']).toBe(
      'public, no-cache, must-revalidate',
    );
    expect(repo.findFirstDomainConfig).toHaveBeenCalledWith([
      'dev.xrugc.com',
      'xrugc.com',
    ]);
  });

  it('uses exact-hostname-first parent-domain precedence', async () => {
    const matched = domain({
      configKey: 'dev.xrugc.com',
      config: domainContent(),
    });
    const findFirstDomainConfig = vi.fn().mockResolvedValue(matched);
    const response = await request(app(repository({ findFirstDomainConfig })))
      .get('/v1/white-label-configs')
      .query({ domain: 'WWW.D.dev.xrugc.com.' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(publicSnapshot());
    expect(findFirstDomainConfig).toHaveBeenCalledWith([
      'www.d.dev.xrugc.com',
      'd.dev.xrugc.com',
      'dev.xrugc.com',
      'xrugc.com',
    ]);
  });

  it('normalizes an IDN hostname to ASCII before lookup and response', async () => {
    const idnRecord = domain({
      configKey: 'xn--bcher-kva.example',
      config: domainContent(),
    });
    const findFirstDomainConfig = vi.fn().mockResolvedValue(idnRecord);
    const response = await request(app(repository({ findFirstDomainConfig })))
      .get('/v1/white-label-configs')
      .query({ domain: 'BÜCHER.example.' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('主站');
    expect(findFirstDomainConfig).toHaveBeenCalledWith(['xn--bcher-kva.example']);
  });

  it('returns the independently stored JSON without rewriting its name', async () => {
    const brandedRecord = domain({
      configKey: 'dev.xrugc.com',
      config: {
        ...domainContent(),
        name: '中文品牌名',
      },
    });
    const response = await request(app(repository({
      findFirstDomainConfig: vi.fn().mockResolvedValue(brandedRecord),
    })))
      .get('/v1/white-label-configs')
      .query({ domain: 'dev.xrugc.com' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ...domainContent(),
      name: '中文品牌名',
    });
  });

  it('returns an empty JSON object when no domain or parent key exists', async () => {
    const findFirstDomainConfig = vi.fn().mockResolvedValue(null);
    const response = await request(app(repository({ findFirstDomainConfig })))
      .get('/v1/white-label-configs')
      .query({ domain: 'missing.example.com' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
    expect(findFirstDomainConfig.mock.calls).toEqual([
      [['missing.example.com', 'example.com']],
    ]);
  });

  it('returns empty without parent fallback after a plugin-disabled higher-priority match', async () => {
    const findFirstDomainConfig = vi.fn().mockResolvedValue(domain({ enabled: false }));
    const response = await request(app(repository({ findFirstDomainConfig })))
      .get('/v1/white-label-configs')
      .query({ domain: 'd.dev.xrugc.com' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
    expect(findFirstDomainConfig).toHaveBeenCalledTimes(1);
  });

  it('does not interpret content fields as plugin enable state', async () => {
    const config = domainContent({ is_active: false });
    const findFirstDomainConfig = vi.fn().mockResolvedValue(domain({ config }));
    const response = await request(app(repository({ findFirstDomainConfig })))
      .get('/v1/white-label-configs')
      .query({ domain: 'dev.xrugc.com' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(config);
  });

  it.each([
    { o: '1', d: '1' },
    { domain: 'https://dev.xrugc.com' },
    { domain: 'dev.xrugc.com:443' },
    { domain: 'dev.xrugc.com/path' },
    { domain: 'dev.xrugc.com?x=1' },
    { domain: 'user@dev.xrugc.com' },
    { domain: 'dev..xrugc.com' },
  ])('returns a generic 404 for a legacy or unsafe public query: %j', async (query) => {
    const repo = repository();
    const response = await request(app(repo))
      .get('/v1/white-label-configs')
      .query(query);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(repo.findFirstDomainConfig).not.toHaveBeenCalled();
  });

  it('emits a strong response-derived ETag and honors If-None-Match', async () => {
    const service = app(repository());
    const first = await request(service)
      .get('/v1/white-label-configs?domain=dev.xrugc.com');
    expect(first.status).toBe(200);
    expect(first.headers.etag).toMatch(/^"wl-[A-Za-z0-9_-]+"$/);

    const cached = await request(service)
      .get('/v1/white-label-configs?domain=dev.xrugc.com')
      .set('If-None-Match', first.headers.etag as string);
    expect(cached.status).toBe(304);
    expect(cached.text).toBe('');
  });

  it('returns a fresh empty JSON response when a domain is disabled after an ETag was issued', async () => {
    const findFirstDomainConfig = vi.fn()
      .mockResolvedValueOnce(domain())
      .mockResolvedValueOnce(domain({ enabled: false }));
    const service = app(repository({ findFirstDomainConfig }));
    const first = await request(service)
      .get('/v1/white-label-configs?domain=dev.xrugc.com');
    expect(first.status).toBe(200);

    const disabled = await request(service)
      .get('/v1/white-label-configs?domain=dev.xrugc.com')
      .set('If-None-Match', first.headers.etag as string);
    expect(disabled.status).toBe(200);
    expect(disabled.body).toEqual({});
    expect(disabled.headers.etag).not.toBe(first.headers.etag);
  });

  it('allows admin and root to read domains but reserves every mutation for root', async () => {
    const repo = repository();
    const adminService = app(repo, adminSession());
    await request(adminService)
      .get('/api/v1/domain-configs')
      .set('Authorization', 'Bearer session-token')
      .expect(200);
    await request(adminService)
      .get(`/api/v1/domain-configs/${DOMAIN_ID}`)
      .set('Authorization', 'Bearer session-token')
      .expect(200);
    await request(adminService)
      .post('/api/v1/domain-configs')
      .set('Authorization', 'Bearer session-token')
      .send({})
      .expect(403);
    await request(adminService)
      .put(`/api/v1/domain-configs/${DOMAIN_ID}`)
      .set('Authorization', 'Bearer session-token')
      .send({})
      .expect(403);
    await request(adminService)
      .post(`/api/v1/domain-configs/${DOMAIN_ID}/disable`)
      .set('Authorization', 'Bearer session-token')
      .send({ revision: 3 })
      .expect(403);
    expect(repo.createDomainConfig).not.toHaveBeenCalled();
    expect(repo.updateDomainConfig).not.toHaveBeenCalled();
    expect(repo.setDomainConfigEnabled).not.toHaveBeenCalled();
  });

  it('lets root create independent JSON under a selected read-only key', async () => {
    const repo = repository();
    const response = await request(app(repo, rootSession(), catalogFor()))
      .post('/api/v1/domain-configs')
      .set('Authorization', 'Bearer session-token')
      .send({ configKey: 'dev.xrugc.com', config: domainContent() });
    expect(response.status).toBe(201);
    expect(response.headers.location).toBe(`/api/v1/domain-configs/${DOMAIN_ID}`);
    expect(repo.createDomainConfig).toHaveBeenCalledWith({
      configKey: 'dev.xrugc.com',
      displayName: 'XR UGC Dev',
      schemaVersion: 1,
      config: domainContent(),
    }, '1');
  });

  it('refuses creation without a selectable catalog key', async () => {
    const repo = repository();
    const unavailable = await request(app(repo))
      .post('/api/v1/domain-configs')
      .set('Authorization', 'Bearer session-token')
      .send({ configKey: 'dev.xrugc.com', config: domainContent() });
    expect(unavailable.status).toBe(503);

    const unlisted = await request(app(repo, rootSession(), catalogFor('xrugc.com')))
      .post('/api/v1/domain-configs')
      .set('Authorization', 'Bearer session-token')
      .send({ configKey: 'dev.xrugc.com', config: domainContent() });
    expect(unlisted.status).toBe(422);
    expect(repo.createDomainConfig).not.toHaveBeenCalled();
  });

  it('keeps the domain import catalog root-only', async () => {
    const catalog: DomainImportCatalog = {
      list: vi.fn().mockResolvedValue({ source: 'fixed', items: [] }),
    };
    await request(app(repository(), adminSession(), catalog))
      .get('/api/v1/domain-import-catalog')
      .set('Authorization', 'Bearer session-token')
      .expect(403);
    const root = await request(app(repository(), rootSession(), catalog))
      .get('/api/v1/domain-import-catalog')
      .set('Authorization', 'Bearer session-token');
    expect(root.status).toBe(200);
    expect(root.headers['cache-control']).toBe('no-store');
  });

  it.each([
    '/api/v1/organization-configs',
    '/api/v1/assignments',
  ])('does not expose retired organization runtime route %s', async (path) => {
    await request(app(repository()))
      .get(path)
      .set('Authorization', 'Bearer session-token')
      .expect(404);
  });
});
