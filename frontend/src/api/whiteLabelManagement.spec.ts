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
  createDomainConfig,
  getDomainConfig,
  getDomainImportCatalog,
  listDomainConfigs,
  normalizeDomainConfig,
  normalizeDomainImportCatalog,
  normalizeDomainImportCatalogItem,
  setDomainConfigEnabled,
  updateDomainConfig,
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

describe('domain-only management API contract', () => {
  beforeEach(() => {
    vi.mocked(backendApi.get).mockReset()
    vi.mocked(backendApi.post).mockReset()
    vi.mocked(backendApi.put).mockReset()
  })

  it('lists domain JSON records with canonical pagination', async () => {
    vi.mocked(backendApi.get).mockResolvedValue({
      data: {
        data: {
          items: [
            {
              domainId: 8,
              schemaVersion: 1,
              revision: 3,
              enabled: true,
              config: catalogConfig(),
            },
          ],
          total: 1,
          page: 2,
          pageSize: 10,
        },
      },
    })

    const result = await listDomainConfigs({
      q: 'xrugc',
      page: 2,
      pageSize: 10,
    })

    expect(backendApi.get).toHaveBeenCalledWith('/domain-configs', {
      params: { q: 'xrugc', page: 2, pageSize: 10 },
    })
    expect(result.items[0]).toMatchObject({
      domainId: 8,
      configKey: 'xrugc-family',
      enabled: true,
      revision: 3,
    })
  })

  it('treats config.name and config.description as authoritative identity', () => {
    expect(
      normalizeDomainConfig({
        domainId: 8,
        configKey: 'legacy.example.com',
        displayName: 'Legacy',
        schemaVersion: 1,
        revision: 2,
        enabled: true,
        config: {
          ...catalogConfig(),
          name: 'dev.xrugc.com',
          description: 'XR UGC Dev',
        },
      }),
    ).toMatchObject({
      domainId: 8,
      configKey: 'dev.xrugc.com',
      description: 'XR UGC Dev',
    })
  })

  it('loads one domain record for full JSON viewing', async () => {
    vi.mocked(backendApi.get).mockResolvedValue({
      data: { data: { domainId: 8, config: catalogConfig() } },
    })

    const result = await getDomainConfig(8)

    expect(backendApi.get).toHaveBeenCalledWith('/domain-configs/8')
    expect(result.config).toEqual(catalogConfig())
  })

  it('creates, updates, and toggles a domain record with revision locking', async () => {
    const config = catalogConfig()
    vi.mocked(backendApi.post).mockResolvedValue({ data: { data: {} } })
    vi.mocked(backendApi.put).mockResolvedValue({ data: { data: {} } })

    await createDomainConfig({
      configKey: config.name,
      schemaVersion: 1,
      config,
    })
    await updateDomainConfig(8, {
      configKey: config.name,
      schemaVersion: 1,
      revision: 5,
      config,
    })
    await setDomainConfigEnabled(8, true, 6)

    expect(backendApi.post).toHaveBeenNthCalledWith(1, '/domain-configs', {
      configKey: 'xrugc-family',
      schemaVersion: 1,
      config,
    })
    expect(backendApi.put).toHaveBeenCalledWith('/domain-configs/8', {
      configKey: 'xrugc-family',
      schemaVersion: 1,
      revision: 5,
      config,
    })
    expect(backendApi.post).toHaveBeenNthCalledWith(
      2,
      '/domain-configs/8/enable',
      { revision: 6 },
    )
  })

  it('loads and normalizes the one-time main-frontend import catalog', async () => {
    const config = catalogConfig()
    vi.mocked(backendApi.get).mockResolvedValue({ data: { data: catalogPayload() } })

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
    ['empty items', { source: 'source', items: [] }, /at least one item/],
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
    ['missing config', catalogPayload({ config: undefined }), /config/],
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
  })
})
