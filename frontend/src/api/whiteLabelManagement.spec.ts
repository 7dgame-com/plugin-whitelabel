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
  listAssignments,
  listOrganizationConfigs,
  normalizeAssignment,
  normalizeDomainConfig,
  setAssignmentEnabled,
  updateOrganizationConfig,
} from './whiteLabelManagement'

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
