import { describe, expect, it, vi } from 'vitest';
import { MainFrontendDomainImportCatalog } from '../src/domainImportCatalog';

function manifest(domains: unknown[]) {
  return { schemaVersion: 1, domains };
}

function entry(
  configKey: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    configKey,
    description: `Description for ${configKey}`,
    isActive: true,
    // The source may contain a full config. The plugin deliberately ignores it.
    config: { name: configKey, sourceOnly: true },
    ...overrides,
  };
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json', ...init.headers },
    ...init,
  });
}

describe('main frontend read-only domain key catalog', () => {
  it('reads only key summaries and never exposes or copies source JSON', async () => {
    const fetcher = vi.fn().mockImplementation(async () => jsonResponse(manifest([
      entry('dev.xrugc.com'),
      entry('xrugc.com', { isActive: false }),
    ])));
    const catalog = new MainFrontendDomainImportCatalog(
      new URL('https://d.xrugc.com/config/domains/manifest.json'),
      500,
      fetcher,
    );

    await expect(catalog.list()).resolves.toEqual({
      source: 'https://d.xrugc.com/config/domains/manifest.json',
      items: [
        {
          configKey: 'dev.xrugc.com',
          description: 'Description for dev.xrugc.com',
          isActive: true,
          selectable: true,
        },
        {
          configKey: 'xrugc.com',
          description: 'Description for xrugc.com',
          isActive: false,
          selectable: false,
          reason: 'The main frontend configuration key is inactive',
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://d.xrugc.com/config/domains/manifest.json',
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
      }),
    );
    const result = await catalog.list();
    expect(result.items[0]).not.toHaveProperty('config');
  });

  it('marks duplicate summaries non-selectable and reports each key once', async () => {
    const catalog = new MainFrontendDomainImportCatalog(
      new URL('https://example.com/manifest.json'),
      500,
      vi.fn().mockResolvedValue(jsonResponse(manifest([
        entry('duplicate.example'),
        entry('duplicate.example', { description: 'Other' }),
      ]))),
    );
    const result = await catalog.list();
    expect(result.items).toEqual([expect.objectContaining({
      configKey: 'duplicate.example',
      selectable: false,
      reason: expect.stringContaining('duplicate'),
    })]);
  });

  it('ignores malformed entries when at least one summary is recognizable', async () => {
    const catalog = new MainFrontendDomainImportCatalog(
      new URL('https://example.com/manifest.json'),
      500,
      vi.fn().mockResolvedValue(jsonResponse(manifest([
        { configKey: 'invalid.example', description: 42, isActive: true },
        entry('valid.example'),
      ]))),
    );
    await expect(catalog.list()).resolves.toMatchObject({
      items: [{ configKey: 'valid.example', selectable: true }],
    });
  });

  it.each([
    ['unsupported schema', { schemaVersion: 2, domains: [entry('a.example')] }],
    ['empty domains', manifest([])],
    ['unknown envelope field', { ...manifest([entry('a.example')]), extra: true }],
    ['no recognizable summaries', manifest([{ configKey: 'bad key' }])],
    ['too many entries', manifest(Array.from({ length: 257 }, (_, index) => entry(`key-${index}.example`)))],
  ])('rejects invalid manifest protocol: %s', async (_name, value) => {
    const catalog = new MainFrontendDomainImportCatalog(
      new URL('https://example.com/manifest.json'),
      500,
      vi.fn().mockResolvedValue(jsonResponse(value)),
    );
    await expect(catalog.list()).rejects.toThrow();
  });

  it.each([
    ['non-success', new Response('', { status: 503, headers: { 'content-type': 'application/json' } })],
    ['non-JSON', new Response('<html/>', { status: 200, headers: { 'content-type': 'text/html' } })],
    ['invalid JSON', new Response('{', { status: 200, headers: { 'content-type': 'application/json' } })],
    ['oversized declaration', new Response('{}', { status: 200, headers: { 'content-type': 'application/json', 'content-length': String(1024 * 1024 + 1) } })],
  ])('rejects unsafe upstream response: %s', async (_name, response) => {
    const catalog = new MainFrontendDomainImportCatalog(
      new URL('https://example.com/manifest.json'),
      500,
      vi.fn().mockResolvedValue(response),
    );
    await expect(catalog.list()).rejects.toThrow();
  });

  it('aborts a stalled request at the configured timeout', async () => {
    const fetcher = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }));
    const catalog = new MainFrontendDomainImportCatalog(
      new URL('https://example.com/manifest.json'),
      10,
      fetcher,
    );
    await expect(catalog.list()).rejects.toThrow();
  });
});
