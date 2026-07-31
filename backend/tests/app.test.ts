import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import type { DomainImportCatalog } from '../src/domainImportCatalog';
import type {
  Assignment,
  AuthenticatedSession,
  DomainConfig,
  OrganizationDirectory,
  OrganizationConfig,
  ResolvedWhiteLabel,
  SessionVerifier,
  StaticDomainConfig,
  WhiteLabelRepository,
} from '../src/types';
import { organizationDirectoryFailure } from '../src/errors';

const ORGANIZATION_ID = 12;
const DOMAIN_ID = 34;
const ASSIGNMENT_ID = 56;
const INTERNAL_TOKEN = 'test-internal-token-that-is-long-enough';
const A1_BASE_URL = new URL('https://a1.fixed.example');

const audit = {
  createdBy: '1',
  updatedBy: '1',
  statusChangedBy: '1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  statusChangedAt: '2026-01-02T00:00:00.000Z',
};

function organization(
  overrides: Partial<OrganizationConfig> = {},
): OrganizationConfig {
  return {
    organizationId: ORGANIZATION_ID,
    organizationName: 'acme',
    organizationTitle: 'Acme Academy',
    schemaVersion: 1,
    revision: 4,
    config: { branding: { primaryColor: '#123456' } },
    enabled: true,
    ...audit,
    ...overrides,
  };
}

function domainSnapshot(
  overrides: Partial<StaticDomainConfig> = {},
): StaticDomainConfig {
  return {
    name: 'dev.xrugc.com',
    description: 'XR UGC Dev',
    is_active: true,
    fallback_domain: 'xrugc.com',
    default_config: {
      homepage: 'https://dev.xrugc.com/',
    },
    configs: {
      'zh-CN': {
        title: 'XR UGC Dev',
        supportUrl: 'https://support.acme.example',
      },
    },
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
    config: domainSnapshot(),
    enabled: true,
    ...audit,
    ...overrides,
  };
}

function assignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    assignmentId: ASSIGNMENT_ID,
    organizationId: ORGANIZATION_ID,
    domainId: DOMAIN_ID,
    revision: 7,
    enabled: true,
    organization: {
      name: 'acme',
      title: 'Acme Academy',
      enabled: true,
    },
    domain: {
      configKey: 'dev.xrugc.com',
      displayName: 'XR UGC Dev',
      enabled: true,
    },
    ...audit,
    ...overrides,
  };
}

function resolved(): ResolvedWhiteLabel {
  return {
    assignmentRevision: 7,
    organization: {
      id: ORGANIZATION_ID,
      name: 'acme',
      title: 'Acme Academy',
      revision: 4,
      schemaVersion: 1,
      config: { branding: { primaryColor: '#123456' } },
    },
    domain: {
      id: DOMAIN_ID,
      configKey: 'dev.xrugc.com',
      revision: 3,
      schemaVersion: 1,
      config: domainSnapshot(),
    },
  };
}

function repository(overrides: Partial<WhiteLabelRepository> = {}): WhiteLabelRepository {
  return {
    health: vi.fn().mockResolvedValue(undefined),
    listOrganizationConfigs: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    createOrganizationConfig: vi.fn().mockResolvedValue(
      organization({ revision: 1, enabled: false }),
    ),
    findOrganizationConfig: vi.fn().mockResolvedValue(organization()),
    updateOrganizationConfig: vi.fn().mockResolvedValue({
      kind: 'updated',
      value: organization({ revision: 5 }),
    }),
    setOrganizationConfigEnabled: vi.fn().mockResolvedValue({
      kind: 'updated',
      value: organization({ revision: 5 }),
    }),
    listDomainConfigs: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    createDomainConfig: vi.fn().mockResolvedValue(domain({ revision: 1, enabled: false })),
    findDomainConfig: vi.fn().mockResolvedValue(domain()),
    updateDomainConfig: vi.fn().mockResolvedValue({
      kind: 'updated',
      value: domain({ revision: 4 }),
    }),
    setDomainConfigEnabled: vi.fn().mockResolvedValue({
      kind: 'updated',
      value: domain({ revision: 4 }),
    }),
    listAssignments: vi.fn().mockResolvedValue({ items: [assignment()], total: 1 }),
    createAssignment: vi.fn().mockResolvedValue(
      assignment({ revision: 1, enabled: false }),
    ),
    findAssignment: vi.fn().mockResolvedValue(assignment()),
    setAssignmentEnabled: vi.fn().mockResolvedValue({
      kind: 'updated',
      value: assignment({ revision: 8 }),
    }),
    resolveEnabledAssignment: vi.fn().mockResolvedValue(resolved()),
    ...overrides,
  };
}

function verifier(session: AuthenticatedSession): SessionVerifier {
  return { verify: vi.fn().mockResolvedValue(session) };
}

function directory(
  overrides: Partial<OrganizationDirectory> = {},
): OrganizationDirectory {
  return {
    findById: vi.fn().mockResolvedValue({
      id: ORGANIZATION_ID,
      name: 'authoritative-acme',
      title: 'Authoritative Acme Academy',
    }),
    ...overrides,
  };
}

function adminSession(): AuthenticatedSession {
  return {
    userId: '8',
    roles: ['admin'],
    organizations: [
      { id: ORGANIZATION_ID, name: 'acme', title: 'Acme Academy' },
      { id: 13, name: 'second', title: 'Second Academy' },
    ],
  };
}

function rootSession(): AuthenticatedSession {
  return { userId: '1', roles: ['root'], organizations: [] };
}

function app(
  repo: WhiteLabelRepository,
  session: AuthenticatedSession = rootSession(),
  organizationDirectory: OrganizationDirectory = directory(),
  domainImportCatalog?: DomainImportCatalog,
) {
  return createApp({
    repository: repo,
    sessionVerifier: verifier(session),
    organizationDirectory,
    internalApiToken: INTERNAL_TOKEN,
    a1PublicBaseUrl: A1_BASE_URL,
    domainImportCatalog,
  });
}

describe('three-layer white-label backend', () => {
  it('reports database readiness', async () => {
    const response = await request(app(repository())).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('exposes the domain import catalog only to root', async () => {
    const catalogResult = {
      source: 'https://frontend.example.com/config/domains/manifest.json',
      items: [{
        configKey: 'dev.xrugc.com',
        description: 'XR UGC Dev',
        isActive: true,
        importable: true,
        materializedFrom: [],
        warnings: [],
        config: domainSnapshot(),
      }],
    };
    const catalog: DomainImportCatalog = {
      list: vi.fn().mockResolvedValue(catalogResult),
    };

    await request(app(repository(), rootSession(), directory(), catalog))
      .get('/api/v1/domain-import-catalog')
      .expect(401);
    await request(app(repository(), adminSession(), directory(), catalog))
      .get('/api/v1/domain-import-catalog')
      .set('Authorization', 'Bearer session-token')
      .expect(403);
    expect(catalog.list).not.toHaveBeenCalled();

    const response = await request(app(repository(), rootSession(), directory(), catalog))
      .get('/api/v1/domain-import-catalog')
      .set('Authorization', 'Bearer session-token');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual(catalogResult);
    expect(catalog.list).toHaveBeenCalledTimes(1);
  });

  it('keeps an unconfigured or failed import catalog isolated behind 503', async () => {
    const repo = repository();
    const serviceWithoutCatalog = app(repo);
    await request(serviceWithoutCatalog)
      .get('/health')
      .expect(200);
    const missing = await request(serviceWithoutCatalog)
      .get('/api/v1/domain-import-catalog')
      .set('Authorization', 'Bearer session-token');
    expect(missing.status).toBe(503);
    expect(missing.body.error.code).toBe('DOMAIN_CATALOG_UNAVAILABLE');

    const failedCatalog: DomainImportCatalog = {
      list: vi.fn().mockRejectedValue(new Error('upstream details must not leak')),
    };
    const failed = await request(app(repo, rootSession(), directory(), failedCatalog))
      .get('/api/v1/domain-import-catalog')
      .set('Authorization', 'Bearer session-token');
    expect(failed.status).toBe(503);
    expect(failed.body.error).toEqual({
      code: 'DOMAIN_CATALOG_UNAVAILABLE',
      message: 'The main-frontend domain import catalog is unavailable',
    });
  });

  it('rejects authenticated users without root or admin', async () => {
    const response = await request(app(repository(), {
      userId: '9',
      roles: ['user'],
      organizations: [{ id: ORGANIZATION_ID, name: 'acme', title: 'Acme' }],
    }))
      .get('/api/v1/organization-configs')
      .set('Authorization', 'Bearer session-token');
    expect(response.status).toBe(403);
  });

  it('SQL-scopes admin organization access and writes the verified snapshot', async () => {
    const repo = repository();
    const service = app(repo, adminSession());

    await request(service)
      .get('/api/v1/organization-configs?page=2&pageSize=10&q=acme')
      .set('Authorization', 'Bearer session-token')
      .expect(200);
    expect(repo.listOrganizationConfigs).toHaveBeenCalledWith(
      [ORGANIZATION_ID, 13],
      { q: 'acme', limit: 10, offset: 10 },
    );

    await request(service)
      .post('/api/v1/organization-configs')
      .set('Authorization', 'Bearer session-token')
      .send({
        organizationId: ORGANIZATION_ID,
        config: { branding: { primaryColor: '#123456' } },
      })
      .expect(201);
    expect(repo.createOrganizationConfig).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      organizationName: 'acme',
      organizationTitle: 'Acme Academy',
      schemaVersion: 1,
      config: { branding: { primaryColor: '#123456' } },
    }, '8');
  });

  it('prevents admin from writing another organization', async () => {
    const repo = repository();
    const response = await request(app(repo, adminSession()))
      .post('/api/v1/organization-configs')
      .set('Authorization', 'Bearer session-token')
      .send({
        organizationId: 999,
        config: {},
      });
    expect(response.status).toBe(403);
    expect(repo.createOrganizationConfig).not.toHaveBeenCalled();
  });

  it('rejects client-supplied organization snapshot fields', async () => {
    const repo = repository();
    const response = await request(app(repo, adminSession()))
      .post('/api/v1/organization-configs')
      .set('Authorization', 'Bearer session-token')
      .send({
        organizationId: ORGANIZATION_ID,
        organizationTitle: 'Forged title',
        config: {},
      });
    expect(response.status).toBe(422);
    expect(repo.createOrganizationConfig).not.toHaveBeenCalled();
  });

  it('uses the authoritative main-platform snapshot for root organization updates', async () => {
    const repo = repository();
    const organizationDirectory = directory();
    const response = await request(app(repo, rootSession(), organizationDirectory))
      .put(`/api/v1/organization-configs/${ORGANIZATION_ID}`)
      .set('Authorization', 'Bearer session-token')
      .send({
        revision: 4,
        schemaVersion: 1,
        config: { features: { classroom: true } },
    });
    expect(response.status).toBe(200);
    expect(organizationDirectory.findById).toHaveBeenCalledWith(
      'Bearer session-token',
      ORGANIZATION_ID,
    );
    expect(repo.updateOrganizationConfig).toHaveBeenCalledWith(
      null,
      ORGANIZATION_ID,
      {
        organizationName: 'authoritative-acme',
        organizationTitle: 'Authoritative Acme Academy',
        revision: 4,
        schemaVersion: 1,
        config: { features: { classroom: true } },
      },
      '1',
    );
  });

  it('rejects a root organization id missing from the main platform', async () => {
    const repo = repository();
    const organizationDirectory = directory({ findById: vi.fn().mockResolvedValue(null) });
    const response = await request(app(repo, rootSession(), organizationDirectory))
      .post('/api/v1/organization-configs')
      .set('Authorization', 'Bearer session-token')
      .send({
        organizationId: 999,
        config: {},
      });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('ORGANIZATION_NOT_FOUND');
    expect(repo.createOrganizationConfig).not.toHaveBeenCalled();
  });

  it('fails root writes closed when the organization directory is unavailable', async () => {
    const repo = repository();
    const organizationDirectory = directory({
      findById: vi.fn().mockRejectedValue(organizationDirectoryFailure()),
    });
    const response = await request(app(repo, rootSession(), organizationDirectory))
      .post('/api/v1/organization-configs')
      .set('Authorization', 'Bearer session-token')
      .send({ organizationId: ORGANIZATION_ID, config: {} });
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('ORGANIZATION_DIRECTORY_ERROR');
    expect(repo.createOrganizationConfig).not.toHaveBeenCalled();
  });

  it('revalidates the main-platform organization before root enables it', async () => {
    const repo = repository();
    const organizationDirectory = directory({
      findById: vi.fn().mockResolvedValue(null),
    });
    const response = await request(app(repo, rootSession(), organizationDirectory))
      .post(`/api/v1/organization-configs/${ORGANIZATION_ID}/enable`)
      .set('Authorization', 'Bearer session-token')
      .send({ revision: 4 });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('ORGANIZATION_NOT_FOUND');
    expect(repo.setOrganizationConfigEnabled).not.toHaveBeenCalled();
  });

  it('makes domain management root-only and validates domain JSON secrets', async () => {
    const repo = repository();
    await request(app(repo, adminSession()))
      .get('/api/v1/domain-configs')
      .set('Authorization', 'Bearer session-token')
      .expect(403);
    expect(repo.listDomainConfigs).not.toHaveBeenCalled();

    const invalid = await request(app(repo))
      .post('/api/v1/domain-configs')
      .set('Authorization', 'Bearer session-token')
      .send({
        configKey: 'dev.xrugc.com',
        config: domainSnapshot({
          default_config: { secrets: { accessToken: 'must-not-be-stored' } },
        }),
      });
    expect(invalid.status).toBe(422);
    expect(repo.createDomainConfig).not.toHaveBeenCalled();
  });

  it('creates numeric domain and assignment resources disabled by default', async () => {
    const repo = repository();
    const service = app(repo);

    const domainResponse = await request(service)
      .post('/api/v1/domain-configs')
      .set('Authorization', 'Bearer session-token')
      .send({
        configKey: 'dev.xrugc.com',
        config: domainSnapshot({
          future_public_field: { enabled: true },
        }),
      });
    expect(domainResponse.status).toBe(201);
    expect(domainResponse.body.data).toMatchObject({
      domainId: DOMAIN_ID,
      enabled: false,
    });
    expect(repo.createDomainConfig).toHaveBeenCalledWith({
      configKey: 'dev.xrugc.com',
      schemaVersion: 1,
      config: domainSnapshot({
        future_public_field: { enabled: true },
      }),
    }, '1');

    const assignmentResponse = await request(service)
      .post('/api/v1/assignments')
      .set('Authorization', 'Bearer session-token')
      .send({ organizationId: ORGANIZATION_ID, domainId: DOMAIN_ID });
    expect(assignmentResponse.status).toBe(201);
    expect(assignmentResponse.body.data).toMatchObject({
      assignmentId: ASSIGNMENT_ID,
      organizationId: ORGANIZATION_ID,
      domainId: DOMAIN_ID,
      enabled: false,
    });
    expect(repo.createAssignment).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      DOMAIN_ID,
      '1',
    );
  });

  it('rejects legacy exact-host fields and mismatched snapshot names', async () => {
    const repo = repository();
    const service = app(repo);

    const legacy = await request(service)
      .post('/api/v1/domain-configs')
      .set('Authorization', 'Bearer session-token')
      .send({
        domain: 'd.dev.xrugc.com',
        displayName: 'Legacy exact host',
        config: domainSnapshot(),
      });
    expect(legacy.status).toBe(422);

    const mismatch = await request(service)
      .post('/api/v1/domain-configs')
      .set('Authorization', 'Bearer session-token')
      .send({
        configKey: 'xrugc.com',
        config: domainSnapshot(),
      });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.error.details).toContainEqual(expect.objectContaining({
      path: 'config.name',
    }));
    expect(repo.createDomainConfig).not.toHaveBeenCalled();
  });

  it('does not enable or keep enabled a snapshot with is_active=false', async () => {
    const inactiveConfig = domainSnapshot({ is_active: false });
    const repo = repository({
      findDomainConfig: vi.fn().mockResolvedValue(domain({
        config: inactiveConfig,
        enabled: false,
      })),
    });
    const service = app(repo);

    const enable = await request(service)
      .post(`/api/v1/domain-configs/${DOMAIN_ID}/enable`)
      .set('Authorization', 'Bearer session-token')
      .send({ revision: 3 });
    expect(enable.status).toBe(422);
    expect(repo.setDomainConfigEnabled).not.toHaveBeenCalled();

    vi.mocked(repo.findDomainConfig).mockResolvedValue(domain({ enabled: true }));
    const update = await request(service)
      .put(`/api/v1/domain-configs/${DOMAIN_ID}`)
      .set('Authorization', 'Bearer session-token')
      .send({
        revision: 3,
        configKey: 'dev.xrugc.com',
        schemaVersion: 1,
        config: inactiveConfig,
      });
    expect(update.status).toBe(422);
    expect(repo.updateDomainConfig).not.toHaveBeenCalled();
  });

  it('lets admin read only scoped assignments and never derives QR URL from the request', async () => {
    const repo = repository();
    const response = await request(app(repo, adminSession()))
      .get('/api/v1/assignments')
      .set('Authorization', 'Bearer session-token')
      .set('Host', 'evil.example')
      .set('X-Forwarded-Host', 'evil.example');

    expect(response.status).toBe(200);
    expect(repo.listAssignments).toHaveBeenCalledWith(
      [ORGANIZATION_ID, 13],
      { limit: 20, offset: 0 },
    );
    expect(response.body.data.items[0].assignmentId).toBe(ASSIGNMENT_ID);
    expect(response.body.data.items[0]).toMatchObject({
      createdBy: '1',
      updatedBy: '1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      organization: {
        name: 'acme',
        title: 'Acme Academy',
        enabled: true,
      },
      domain: {
        configKey: 'dev.xrugc.com',
        displayName: 'XR UGC Dev',
        enabled: true,
      },
    });
    expect(response.body.data.items[0].qrUrl).toBe(
      'https://a1.fixed.example/v1/white-label-configs?o=12&d=34',
    );
  });

  it('prevents admin from creating or changing assignments', async () => {
    const repo = repository();
    const service = app(repo, adminSession());

    await request(service)
      .post('/api/v1/assignments')
      .set('Authorization', 'Bearer session-token')
      .send({ organizationId: ORGANIZATION_ID, domainId: DOMAIN_ID })
      .expect(403);
    await request(service)
      .post(`/api/v1/assignments/${ASSIGNMENT_ID}/enable`)
      .set('Authorization', 'Bearer session-token')
      .send({ revision: 7 })
      .expect(403);
    expect(repo.createAssignment).not.toHaveBeenCalled();
    expect(repo.setAssignmentEnabled).not.toHaveBeenCalled();
  });

  it('returns current revision on optimistic-lock conflict', async () => {
    const repo = repository({
      setAssignmentEnabled: vi.fn().mockResolvedValue({
        kind: 'revision_conflict',
        currentRevision: 9,
      }),
    });
    const response = await request(app(repo))
      .post(`/api/v1/assignments/${ASSIGNMENT_ID}/enable`)
      .set('Authorization', 'Bearer session-token')
      .send({ revision: 7 });
    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({
      code: 'REVISION_CONFLICT',
      details: { currentRevision: 9 },
    });
  });

  it('requires internal token and gives every invalid combination the same 404', async () => {
    const repo = repository({ resolveEnabledAssignment: vi.fn().mockResolvedValue(null) });
    const service = app(repo);

    await request(service)
      .get(`/internal/v1/white-label-configs/resolve?o=${ORGANIZATION_ID}&d=${DOMAIN_ID}`)
      .expect(401);
    const missing = await request(service)
      .get(`/internal/v1/white-label-configs/resolve?o=${ORGANIZATION_ID}&d=${DOMAIN_ID}`)
      .set('X-Internal-Token', INTERNAL_TOKEN);
    const invalid = await request(service)
      .get('/internal/v1/white-label-configs/resolve?o=0&d=bad')
      .set('X-Internal-Token', INTERNAL_TOKEN);
    expect(missing.status).toBe(404);
    expect(invalid.status).toBe(404);
    expect(invalid.body).toEqual(missing.body);
  });

  it('never resolves a domain snapshot with is_active=false', async () => {
    const inactive = resolved();
    inactive.domain.config = domainSnapshot({ is_active: false });
    const service = app(repository({
      resolveEnabledAssignment: vi.fn().mockResolvedValue(inactive),
    }));

    await request(service)
      .get(`/internal/v1/white-label-configs/resolve?o=${ORGANIZATION_ID}&d=${DOMAIN_ID}`)
      .set('X-Internal-Token', INTERNAL_TOKEN)
      .expect(404);
  });

  it('returns the two independent configs directly and supports ETag revalidation', async () => {
    const service = app(repository());
    const path = `/internal/v1/white-label-configs/resolve?o=${ORGANIZATION_ID}&d=${DOMAIN_ID}`;
    const first = await request(service)
      .get(path)
      .set('X-Internal-Token', INTERNAL_TOKEN);

    expect(first.status).toBe(200);
    expect(first.headers.etag).toBe('"wl-o12-r4-d34-r3-a7"');
    expect(first.headers['cache-control']).toBe('private, max-age=60');
    expect(first.body).toEqual({
      version: 1,
      organization: resolved().organization,
      domain: resolved().domain,
    });

    const cached = await request(service)
      .get(path)
      .set('X-Internal-Token', INTERNAL_TOKEN)
      .set('If-None-Match', first.headers.etag);
    expect(cached.status).toBe(304);
    expect(cached.text).toBe('');
  });

});
