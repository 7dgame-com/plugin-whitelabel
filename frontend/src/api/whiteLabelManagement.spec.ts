import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./client', () => ({
  backendApi: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
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

const CONFIG_KEY = 'xrugc-family'
const independentConfig = { name: '主站', theme: { primaryColor: '#409eff' } }

function catalogItem(overrides: Record<string, unknown> = {}) {
  return {
    configKey: CONFIG_KEY,
    description: 'XR UGC agent family',
    isActive: true,
    selectable: true,
    ...overrides,
  }
}

function catalogPayload(
  itemOverrides: Record<string, unknown> = {},
  rootOverrides: Record<string, unknown> = {},
) {
  return {
    source: 'https://d.xrugc.com/config/domains/manifest.json',
    items: [catalogItem(itemOverrides)],
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
    vi.mocked(backendApi.get).mockResolvedValue({ data: { data: {
      items: [{
        domainId: 8,
        configKey: CONFIG_KEY,
        displayName: 'XR UGC agent family',
        schemaVersion: 1,
        revision: 3,
        enabled: true,
        config: independentConfig,
      }],
      total: 1,
      page: 2,
      pageSize: 10,
    } } })
    const result = await listDomainConfigs({ q: 'xrugc', page: 2, pageSize: 10 })
    expect(backendApi.get).toHaveBeenCalledWith('/domain-configs', {
      params: { q: 'xrugc', page: 2, pageSize: 10 },
    })
    expect(result.items[0]).toMatchObject({
      configKey: CONFIG_KEY,
      description: 'XR UGC agent family',
      config: independentConfig,
    })
  })

  it('keeps external identity separate and preserves every JSON field', () => {
    expect(normalizeDomainConfig({
      domainId: 8,
      configKey: 'dev.xrugc.com',
      displayName: 'Dev site',
      config: independentConfig,
    })).toMatchObject({
      configKey: 'dev.xrugc.com',
      description: 'Dev site',
      config: independentConfig,
    })
  })

  it('loads one domain record for full JSON viewing', async () => {
    vi.mocked(backendApi.get).mockResolvedValue({
      data: { data: { domainId: 8, config: independentConfig } },
    })
    expect((await getDomainConfig(8)).config).toEqual(independentConfig)
    expect(backendApi.get).toHaveBeenCalledWith('/domain-configs/8')
  })

  it('creates, updates, and toggles with revision locking', async () => {
    vi.mocked(backendApi.post).mockResolvedValue({ data: { data: {} } })
    vi.mocked(backendApi.put).mockResolvedValue({ data: { data: {} } })
    await createDomainConfig({ configKey: CONFIG_KEY, schemaVersion: 1, config: independentConfig })
    await updateDomainConfig(8, { schemaVersion: 1, revision: 5, config: independentConfig })
    await setDomainConfigEnabled(8, true, 6)
    expect(backendApi.post).toHaveBeenNthCalledWith(1, '/domain-configs', {
      configKey: CONFIG_KEY,
      schemaVersion: 1,
      config: independentConfig,
    })
    expect(backendApi.put).toHaveBeenCalledWith('/domain-configs/8', {
      schemaVersion: 1,
      revision: 5,
      config: independentConfig,
    })
    expect(backendApi.post).toHaveBeenNthCalledWith(2, '/domain-configs/8/enable', { revision: 6 })
  })

  it('loads a read-only key catalog without source JSON', async () => {
    vi.mocked(backendApi.get).mockResolvedValue({ data: { data: catalogPayload() } })
    const result = await getDomainImportCatalog()
    expect(backendApi.get).toHaveBeenCalledWith('/domain-import-catalog')
    expect(result.items).toEqual([catalogItem()])
    expect(result.items[0]).not.toHaveProperty('config')
  })

  it('accepts an inactive non-selectable key with a reason', () => {
    expect(normalizeDomainImportCatalogItem(catalogItem({
      isActive: false,
      selectable: false,
      reason: 'Inactive',
    }))).toEqual(catalogItem({
      isActive: false,
      selectable: false,
      reason: 'Inactive',
    }))
  })

  it.each([
    ['source', catalogPayload({}, { source: 42 }), /source/],
    ['items', catalogPayload({}, { items: {} }), /items/],
    ['empty items', { source: 'source', items: [] }, /at least one/],
    ['configKey', catalogPayload({ configKey: 42 }), /configKey/],
    ['description', catalogPayload({ description: null }), /description/],
    ['isActive', catalogPayload({ isActive: 1 }), /isActive/],
    ['selectable', catalogPayload({ selectable: 'true' }), /selectable/],
    ['missing reason', catalogPayload({ selectable: false }), /reason/],
  ])('rejects an invalid catalog %s', (_name, value, pattern) => {
    expect(() => normalizeDomainImportCatalog(value)).toThrow(pattern)
  })
})
