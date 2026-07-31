import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./client', () => ({
  backendApi: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

import { backendApi } from './client'
import {
  createAssignment,
  createDomainConfig,
  createOrganizationConfig,
  getDomainImportCatalog,
  listAssignments,
  listOrganizationConfigs,
  normalizeAssignment,
  normalizeDomainConfig,
  normalizeDomainImportCatalog,
  normalizeDomainImportCatalogItem,
  setAssignmentEnabled,
  updateOrganizationConfig,
} from './whiteLabelManagement'

function catalogConfig() {
  return {
    name: 'xrugc-family',
    description: 'XR UGC agent family',
    is_active: true,
    fallback_domain: null,
    default_config: { theme: 'blue' },
    configs: {},
  }
}

function importableCatalogItem(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    configKey: 'xrugc-family',
    description: 'XR UGC agent family',
    isActive: true,
    importable: true,
    materializedFrom: ['base.json', 'xrugc-family.json'],
    warnings: ['fallback was materialized'],
    config: catalogConfig(),
    ...overrides,
  }
}

function catalogPayload(
  itemOverrides: Record<string, unknown> = {},
  rootOverrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    source: 'web/public/config/domains/index.json',
    items: [importableCatalogItem(itemOverrides)],
    ...rootOverrides,
  }
}

describe('three-resource management API contract', () => {
  beforeEach(() => {
    vi.mocked(backendApi.get).mockReset()
    vi.mocked(backendApi.post).mockReset()
    vi.mocked(backendApi.put).mockReset()
  })

  it('lists organization JSON records with canonical pagination', async () => {
    vi.mocked(backendApi.get).mockResolvedValue({
      data: {
        data: {
          items: [
            {
              organizationId: 42,
              organizationName: 'buyer',
              organizationTitle: '购买方',
              schemaVersion: 1,
              enabled: true,
              revision: 3,
              config: { tenantName: 'Buyer' },
            },
          ],
          total: 1,
          page: 2,
          pageSize: 10,
        },
      },
    })

    const result = await listOrganizationConfigs({
      q: 'buyer',
      page: 2,
      pageSize: 10,
    })

    expect(backendApi.get).toHaveBeenCalledWith('/organization-configs', {
      params: { q: 'buyer', page: 2, pageSize: 10 },
    })
    expect(result.items[0]).toMatchObject({
      organizationId: 42,
      organizationName: 'buyer',
      enabled: true,
      revision: 3,
      config: { tenantName: 'Buyer' },
    })
  })

  it('creates organization and domain JSON as independent disabled records', async () => {
    vi.mocked(backendApi.post).mockResolvedValue({ data: { data: {} } })

    const domainConfig = {
      name: 'dev.xrugc.com',
      description: 'XR UGC Dev',
      is_active: true,
      fallback_domain: null,
      default_config: { agentBrand: 'north' },
      configs: {},
    }

    await createOrganizationConfig({
      organizationId: 42,
      schemaVersion: 1,
      config: { buyerTheme: 'blue' },
    })
    await createDomainConfig({
      configKey: 'dev.xrugc.com',
      schemaVersion: 1,
      config: domainConfig,
    })

    expect(backendApi.post).toHaveBeenNthCalledWith(
      1,
      '/organization-configs',
      {
        organizationId: 42,
        schemaVersion: 1,
        config: { buyerTheme: 'blue' },
      },
    )
    expect(backendApi.post).toHaveBeenNthCalledWith(2, '/domain-configs', {
      configKey: 'dev.xrugc.com',
      schemaVersion: 1,
      config: domainConfig,
    })
    expect(vi.mocked(backendApi.post).mock.calls[0]?.[1]).not.toHaveProperty(
      'enabled',
    )
    expect(vi.mocked(backendApi.post).mock.calls[1]?.[1]).not.toHaveProperty(
      'enabled',
    )
  })

  it('normalizes the domain key and derives its label from config.description', () => {
    expect(
      normalizeDomainConfig({
        domainId: 8,
        configKey: 'dev.xrugc.com',
        schemaVersion: 1,
        revision: 2,
        enabled: true,
        config: {
          name: 'dev.xrugc.com',
          description: 'XR UGC Dev',
          is_active: true,
          fallback_domain: null,
          default_config: {},
          configs: {},
        },
      }),
    ).toMatchObject({
      domainId: 8,
      configKey: 'dev.xrugc.com',
      description: 'XR UGC Dev',
    })
  })

  it('loads and normalizes the one-time main-frontend import catalog', async () => {
    const config = catalogConfig()
    vi.mocked(backendApi.get).mockResolvedValue({
      data: {
        data: {
          source: 'web/public/config/domains/index.json',
          items: [
            {
              configKey: 'xrugc-family',
              description: 'XR UGC agent family',
              isActive: true,
              importable: true,
              materializedFrom: ['base.json', 'xrugc-family.json'],
              warnings: ['fallback was materialized'],
              config,
            },
          ],
        },
      },
    })

    const result = await getDomainImportCatalog()

    expect(backendApi.get).toHaveBeenCalledWith('/domain-import-catalog')
    expect(result).toEqual({
      source: 'web/public/config/domains/index.json',
      items: [
        {
          configKey: 'xrugc-family',
          description: 'XR UGC agent family',
          isActive: true,
          importable: true,
          materializedFrom: ['base.json', 'xrugc-family.json'],
          warnings: ['fallback was materialized'],
          config,
        },
      ],
    })
  })

  it('accepts an exact nonimportable item without fabricating config', () => {
    expect(
      normalizeDomainImportCatalogItem({
        configKey: 'broken-family',
        description: 'Broken family',
        isActive: false,
        importable: false,
        materializedFrom: ['base.json'],
        warnings: ['invalid schema'],
        reason: 'The source JSON is invalid',
      }),
    ).toEqual({
      configKey: 'broken-family',
      description: 'Broken family',
      isActive: false,
      importable: false,
      materializedFrom: ['base.json'],
      warnings: ['invalid schema'],
      reason: 'The source JSON is invalid',
    })
  })

  it.each([
    ['source', catalogPayload({}, { source: 42 }), /catalog\.source/],
    ['items', catalogPayload({}, { items: {} }), /catalog\.items/],
    [
      'empty items',
      { source: 'source', items: [] },
      /at least one item/,
    ],
    ['item', { source: 'source', items: [null] }, /items\[0\]/],
    ['configKey', catalogPayload({ configKey: 42 }), /configKey/],
    ['description', catalogPayload({ description: null }), /description/],
    ['isActive', catalogPayload({ isActive: 1 }), /isActive/],
    ['importable', catalogPayload({ importable: 'true' }), /importable/],
    [
      'materializedFrom',
      catalogPayload({ materializedFrom: ['base.json', 42] }),
      /materializedFrom\[1\]/,
    ],
    ['warnings', catalogPayload({ warnings: 'warning' }), /warnings/],
  ])('rejects a catalog with a non-exact %s field', (_field, value, message) => {
    expect(() => normalizeDomainImportCatalog(value)).toThrow(message)
  })

  it.each([
    [
      'missing config',
      catalogPayload({ config: undefined }),
      /config/,
    ],
    [
      'schema-invalid config',
      catalogPayload({
        config: {
          name: 'xrugc-family',
          description: 'XR UGC agent family',
          is_active: true,
          fallback_domain: null,
          default_config: {},
        },
      }),
      /StaticDomainConfig/,
    ],
    [
      'unsafe config',
      catalogPayload({
        config: {
          ...catalogConfig(),
          default_config: { apiToken: 'must not be imported' },
        },
      }),
      /StaticDomainConfig/,
    ],
    [
      'configKey mismatch',
      catalogPayload({
        config: { ...catalogConfig(), name: 'different-family' },
      }),
      /config\.name/,
    ],
    [
      'description mismatch',
      catalogPayload({
        config: { ...catalogConfig(), description: 'Different' },
      }),
      /config\.description/,
    ],
    [
      'isActive mismatch',
      catalogPayload({
        config: { ...catalogConfig(), is_active: false },
      }),
      /config\.is_active/,
    ],
  ])('rejects importable catalog item with %s', (_case, value, message) => {
    expect(() => normalizeDomainImportCatalog(value)).toThrow(message)
  })

  it.each([
    [
      'missing reason',
      {
        configKey: 'broken-family',
        description: 'Broken family',
        isActive: false,
        importable: false,
        materializedFrom: [],
        warnings: [],
      },
      /reason/,
    ],
    [
      'non-string reason',
      {
        configKey: 'broken-family',
        description: 'Broken family',
        isActive: false,
        importable: false,
        materializedFrom: [],
        warnings: [],
        reason: 42,
      },
      /reason/,
    ],
    [
      'invalid materializedFrom',
      {
        configKey: 'broken-family',
        description: 'Broken family',
        isActive: false,
        importable: false,
        materializedFrom: [42],
        warnings: [],
        reason: 'Unavailable',
      },
      /materializedFrom/,
    ],
    [
      'invalid warnings',
      {
        configKey: 'broken-family',
        description: 'Broken family',
        isActive: false,
        importable: false,
        materializedFrom: [],
        warnings: [null],
        reason: 'Unavailable',
      },
      /warnings/,
    ],
  ])('rejects nonimportable item with %s', (_case, value, message) => {
    expect(() => normalizeDomainImportCatalogItem(value)).toThrow(message)
  })

  it('rejects a corrupted 200 response instead of returning an empty catalog', async () => {
    vi.mocked(backendApi.get).mockResolvedValue({
      data: catalogPayload({ isActive: 'true' }),
    })

    await expect(getDomainImportCatalog()).rejects.toThrow(/isActive/)
    expect(backendApi.get).toHaveBeenCalledWith('/domain-import-catalog')
  })

  it('updates organization JSON with only revision, schema and config', async () => {
    vi.mocked(backendApi.put).mockResolvedValue({ data: { data: {} } })

    await updateOrganizationConfig(42, {
      revision: 5,
      schemaVersion: 1,
      config: { buyerTheme: 'green' },
    })

    expect(backendApi.put).toHaveBeenCalledWith('/organization-configs/42', {
      revision: 5,
      schemaVersion: 1,
      config: { buyerTheme: 'green' },
    })
    const body = vi.mocked(backendApi.put).mock.calls[0]?.[1]
    expect(body).not.toHaveProperty('organizationName')
    expect(body).not.toHaveProperty('domain')
  })

  it('creates a reference-only assignment and toggles it with revision', async () => {
    vi.mocked(backendApi.post).mockResolvedValue({ data: { data: {} } })

    await createAssignment({
      organizationId: 42,
      domainId: 8,
    })
    await setAssignmentEnabled(11, true, 4)

    expect(backendApi.post).toHaveBeenNthCalledWith(1, '/assignments', {
      organizationId: 42,
      domainId: 8,
    })
    expect(backendApi.post).toHaveBeenNthCalledWith(
      2,
      '/assignments/11/enable',
      { revision: 4 },
    )
  })

  it('uses only the backend-provided qrUrl', async () => {
    vi.mocked(backendApi.get).mockResolvedValue({
      data: {
        data: {
          items: [
            {
              assignmentId: 11,
              organizationId: 42,
              domainId: 8,
              enabled: true,
              organization: { enabled: true },
              domain: { enabled: true },
              revision: 2,
              qrUrl:
                'https://a1.example.com/v1/white-label-configs?o=42&d=8',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        },
      },
    })

    const result = await listAssignments()
    expect(result.items[0]?.qrUrl).toBe(
      'https://a1.example.com/v1/white-label-configs?o=42&d=8',
    )
  })

  it('normalizes the final nested assignment DTO', () => {
    expect(
      normalizeAssignment({
        assignmentId: 11,
        organizationId: 42,
        domainId: 8,
        organization: {
          organizationName: 'buyer',
          organizationTitle: '购买方',
          enabled: true,
        },
        domain: {
          domainId: 8,
          configKey: 'dev.xrugc.com',
          description: 'XR UGC Dev',
          enabled: true,
        },
        enabled: true,
        revision: 2,
        qrUrl:
          'https://a1.example.com/v1/white-label-configs?o=42&d=8',
      }),
    ).toMatchObject({
      assignmentId: 11,
      organizationId: 42,
      domainId: 8,
      organizationName: 'buyer',
      domainConfigKey: 'dev.xrugc.com',
      domainDescription: 'XR UGC Dev',
      enabled: true,
      organizationEnabled: true,
      domainEnabled: true,
    })
  })
})
