import { afterEach, describe, expect, it, vi } from 'vitest';
import { MainFrontendDomainImportCatalog } from '../src/domainImportCatalog';
import type { StaticDomainConfig } from '../src/types';

const manifestUrl = new URL(
  'https://frontend.example.com/config/domains/manifest.json',
);

function config(
  name: string,
  overrides: Partial<StaticDomainConfig> = {},
): StaticDomainConfig {
  return {
    name,
    description: `Description for ${name}`,
    is_active: true,
    fallback_domain: null,
    default_config: { homepage: `https://${name}/` },
    configs: {},
    ...overrides,
  };
}

function entry(domainConfig: StaticDomainConfig) {
  return {
    configKey: domainConfig.name,
    description: domainConfig.description,
    isActive: domainConfig.is_active,
    config: domainConfig,
  };
}

function manifest(domains: unknown[]) {
  return { schemaVersion: 1, domains };
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json; charset=utf-8');
  }
  return new Response(JSON.stringify(value), { ...init, headers });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('main frontend domain import catalog', () => {
  it('requests only the fixed manifest URL with fixed, credential-free options', async () => {
    const sourceConfig = config('dev.xrugc.com');
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(manifest([
      entry(sourceConfig),
    ])));
    const catalog = new MainFrontendDomainImportCatalog(
      manifestUrl,
      3_000,
      fetcher,
    );

    const result = await catalog.list();

    expect(result).toEqual({
      source: manifestUrl.toString(),
      items: [{
        configKey: sourceConfig.name,
        description: sourceConfig.description,
        isActive: true,
        importable: true,
        materializedFrom: [],
        warnings: [],
        config: sourceConfig,
      }],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [requestedUrl, init] = fetcher.mock.calls[0] ?? [];
    expect(String(requestedUrl)).toBe(manifestUrl.toString());
    expect(init).toMatchObject({
      method: 'GET',
      redirect: 'error',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
    expect(Object.keys(init?.headers ?? {})).toEqual(['Accept']);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('materializes a bounded fallback chain from the same manifest', async () => {
    const source = config('source.example', {
      description: 'Source identity',
      fallback_domain: 'middle.example',
      default_config: {},
      configs: {},
    });
    const middle = config('middle.example', {
      fallback_domain: 'base.example',
      default_config: {},
      configs: {},
    });
    const base = config('base.example', {
      default_config: { icon: 'https://cdn.example/base.webp' },
      configs: { 'zh-CN': { title: 'Base title' } },
    });
    const catalog = new MainFrontendDomainImportCatalog(
      manifestUrl,
      3_000,
      vi.fn().mockResolvedValue(jsonResponse(manifest([
        entry(source),
        entry(middle),
        entry(base),
      ]))),
    );

    const result = await catalog.list();
    const imported = result.items.find((item) => item.configKey === source.name);
    expect(imported).toMatchObject({
      importable: true,
      materializedFrom: ['middle.example', 'base.example'],
      config: {
        name: source.name,
        description: source.description,
        is_active: source.is_active,
        fallback_domain: source.fallback_domain,
        default_config: base.default_config,
        configs: base.configs,
      },
    });
    expect(imported?.warnings[0]).toMatch(/materialized/i);
  });

  it('merges partial defaults and locales layer by layer across the complete chain', async () => {
    const source = config('layer-source.example', {
      fallback_domain: 'layer-middle.example',
      default_config: { logo: 'source.svg' },
      configs: {
        'en-US': {},
        'zh-CN': { title: 'Source Chinese' },
      },
      future_field: { owner: 'source' },
    });
    const middle = config('layer-middle.example', {
      fallback_domain: 'layer-base.example',
      default_config: { logo: 'middle.svg', theme: 'middle' },
      configs: {
        'en-US': { title: 'Middle English' },
        'zh-CN': { title: 'Middle Chinese' },
        'ja-JP': {},
      },
      future_field: { owner: 'middle' },
    });
    const base = config('layer-base.example', {
      default_config: { logo: 'base.svg', theme: 'base' },
      configs: {
        'en-US': { title: 'Base English' },
        'ja-JP': { title: 'Base Japanese' },
        'fr-FR': {},
      },
    });
    const catalog = new MainFrontendDomainImportCatalog(
      manifestUrl,
      3_000,
      vi.fn().mockResolvedValue(jsonResponse(manifest([
        entry(source),
        entry(middle),
        entry(base),
      ]))),
    );

    const imported = (await catalog.list()).items.find(
      (item) => item.configKey === source.name,
    );
    expect(imported).toMatchObject({
      importable: true,
      materializedFrom: [middle.name, base.name],
      config: {
        name: source.name,
        description: source.description,
        is_active: source.is_active,
        fallback_domain: source.fallback_domain,
        default_config: { logo: 'source.svg' },
        configs: {
          'en-US': { title: 'Middle English' },
          'zh-CN': { title: 'Source Chinese' },
          'ja-JP': { title: 'Base Japanese' },
        },
        future_field: { owner: 'source' },
      },
    });
    expect(imported?.config?.configs).not.toHaveProperty('fr-FR');
  });

  it('does not recursively resolve null or self fallbacks', async () => {
    const noFallback = config('null.example');
    const selfFallback = config('self.example', {
      fallback_domain: 'self.example',
      default_config: {},
      configs: {},
    });
    const catalog = new MainFrontendDomainImportCatalog(
      manifestUrl,
      3_000,
      vi.fn().mockResolvedValue(jsonResponse(manifest([
        entry(noFallback),
        entry(selfFallback),
      ]))),
    );

    const result = await catalog.list();
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        configKey: noFallback.name,
        importable: true,
        materializedFrom: [],
        warnings: [],
      }),
      expect.objectContaining({
        configKey: selfFallback.name,
        importable: true,
        materializedFrom: [],
      }),
    ]));
  });

  it('marks missing, inactive, cyclic, and empty fallback targets unimportable', async () => {
    const missing = config('missing-source.example', {
      fallback_domain: 'absent.example',
      default_config: { title: 'Local data must not hide a broken chain' },
      configs: {},
    });
    const inactiveSource = config('inactive-source.example', {
      is_active: false,
    });
    const inactiveFallbackSource = config('inactive-fallback-source.example', {
      fallback_domain: 'inactive-target.example',
      default_config: {},
      configs: {},
    });
    const inactiveTarget = config('inactive-target.example', {
      is_active: false,
    });
    const cycleA = config('cycle-a.example', {
      fallback_domain: 'cycle-b.example',
      default_config: {},
      configs: {},
    });
    const cycleB = config('cycle-b.example', {
      fallback_domain: 'cycle-a.example',
      default_config: {},
      configs: {},
    });
    const emptySource = config('empty-source.example', {
      fallback_domain: 'empty-target.example',
      default_config: { title: 'Local data still requires a valid terminal' },
      configs: {},
    });
    const emptyTarget = config('empty-target.example', {
      default_config: {},
      configs: {},
    });
    const catalog = new MainFrontendDomainImportCatalog(
      manifestUrl,
      3_000,
      vi.fn().mockResolvedValue(jsonResponse(manifest([
        entry(missing),
        entry(inactiveSource),
        entry(inactiveFallbackSource),
        entry(inactiveTarget),
        entry(cycleA),
        entry(cycleB),
        entry(emptySource),
        entry(emptyTarget),
      ]))),
    );

    const items = (await catalog.list()).items;
    expect(items.find((item) => item.configKey === missing.name)?.reason).toMatch(/missing/i);
    expect(items.find((item) => item.configKey === inactiveSource.name)?.reason).toMatch(
      /source.*inactive/i,
    );
    expect(items.find((item) => item.configKey === inactiveFallbackSource.name)?.reason).toMatch(
      /fallback.*inactive/i,
    );
    expect(items.find((item) => item.configKey === cycleA.name)?.reason).toMatch(/cycle/i);
    expect(items.find((item) => item.configKey === emptySource.name)?.reason).toMatch(
      /no local Unity config data/i,
    );
    const failedItems = items.filter((item) => [
      missing.name,
      inactiveSource.name,
      inactiveFallbackSource.name,
      cycleA.name,
      emptySource.name,
    ].includes(item.configKey));
    expect(failedItems.every(
      (item) => !item.importable && item.config === undefined,
    )).toBe(true);
  });

  it('stops fallback traversal after eight manifest targets', async () => {
    const chain = Array.from({ length: 10 }, (_, index) => config(`depth-${index}.example`, {
      fallback_domain: index === 9 ? null : `depth-${index + 1}.example`,
      default_config: index === 9 ? { title: 'Too deep' } : {},
      configs: {},
    }));
    const catalog = new MainFrontendDomainImportCatalog(
      manifestUrl,
      3_000,
      vi.fn().mockResolvedValue(jsonResponse(manifest(chain.map(entry)))),
    );

    const source = (await catalog.list()).items[0];
    expect(source).toMatchObject({
      importable: false,
      materializedFrom: chain.slice(1, 9).map((item) => item.name),
    });
    expect(source?.reason).toMatch(/maximum depth of 8/i);
  });

  it.each([
    {
      name: 'unsupported manifest schema',
      value: { ...manifest([entry(config('one.example'))]), schemaVersion: 2 },
    },
    {
      name: 'empty domain array',
      value: manifest([]),
    },
    {
      name: 'unknown envelope field',
      value: {
        ...manifest([entry(config('one.example'))]),
        unexpected: true,
      },
    },
  ])('rejects an invalid manifest envelope: $name', async ({ value }) => {
    const catalog = new MainFrontendDomainImportCatalog(
      manifestUrl,
      3_000,
      vi.fn().mockResolvedValue(jsonResponse(value)),
    );
    await expect(catalog.list()).rejects.toThrow(/schema version 1/);
  });

  it('rejects a non-empty manifest with no recognizable domain summaries', async () => {
    const catalog = new MainFrontendDomainImportCatalog(
      manifestUrl,
      3_000,
      vi.fn().mockResolvedValue(jsonResponse(manifest([
        {} as ReturnType<typeof entry>,
      ]))),
    );

    await expect(catalog.list()).rejects.toThrow(/no recognizable domain entries/i);
  });

  it('isolates recognizable invalid entries while retaining valid catalog items', async () => {
    const good = config('good.example');
    const mismatchedName = {
      ...entry(config('actual-name.example')),
      configKey: 'summary-name.example',
    };
    const mismatchedSummary = {
      ...entry(config('summary.example')),
      description: 'Forged summary',
    };
    const secretBearing = entry(config('secret.example', {
      default_config: { accessToken: 'must-not-be-imported' },
    }));
    const catalog = new MainFrontendDomainImportCatalog(
      manifestUrl,
      3_000,
      vi.fn().mockResolvedValue(jsonResponse(manifest([
        mismatchedName,
        entry(good),
        mismatchedSummary,
        secretBearing,
        {
          configKey: 'unrecognized-summary.example',
          isActive: true,
          config: config('unrecognized-summary.example'),
        },
      ]))),
    );

    const items = (await catalog.list()).items;
    expect(items.find((item) => item.configKey === good.name)).toMatchObject({
      importable: true,
      config: good,
    });
    for (const configKey of [
      mismatchedName.configKey,
      mismatchedSummary.configKey,
      secretBearing.configKey,
    ]) {
      expect(items.find((item) => item.configKey === configKey)).toMatchObject({
        importable: false,
        reason: expect.stringMatching(/does not satisfy/i),
      });
      expect(items.find((item) => item.configKey === configKey)?.config).toBeUndefined();
    }
    expect(items.find(
      (item) => item.configKey === 'unrecognized-summary.example',
    )).toBeUndefined();
  });

  it('never selects a duplicate key as an item or fallback donor', async () => {
    const duplicateOne = config('duplicate.example', {
      default_config: { selected: 'one' },
    });
    const duplicateTwo = config('duplicate.example', {
      default_config: { selected: 'two' },
    });
    const source = config('duplicate-source.example', {
      fallback_domain: duplicateOne.name,
      default_config: {},
      configs: {},
    });
    const good = config('still-good.example');
    const catalog = new MainFrontendDomainImportCatalog(
      manifestUrl,
      3_000,
      vi.fn().mockResolvedValue(jsonResponse(manifest([
        entry(duplicateOne),
        entry(source),
        entry(good),
        entry(duplicateTwo),
      ]))),
    );

    const items = (await catalog.list()).items;
    const duplicates = items.filter((item) => item.configKey === duplicateOne.name);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]).toMatchObject({
      importable: false,
      reason: expect.stringMatching(/duplicate/i),
    });
    expect(duplicates[0]?.config).toBeUndefined();
    expect(items.find((item) => item.configKey === source.name)).toMatchObject({
      importable: false,
      reason: expect.stringMatching(/duplicate/i),
    });
    expect(items.find((item) => item.configKey === good.name)?.importable).toBe(true);
  });

  it('rejects more than 256 manifest entries', async () => {
    const domains = Array.from({ length: 257 }, (_, index) => entry(config(
      `domain-${index}.example`,
      { default_config: { index } },
    )));
    const catalog = new MainFrontendDomainImportCatalog(
      manifestUrl,
      3_000,
      vi.fn().mockResolvedValue(jsonResponse(manifest(domains))),
    );
    await expect(catalog.list()).rejects.toThrow(/schema version 1/);
  });

  it.each([
    {
      name: 'non-success response',
      response: new Response(null, { status: 302, headers: { location: 'https://evil.example' } }),
    },
    {
      name: 'non-JSON content type',
      response: new Response('{}', { headers: { 'content-type': 'text/plain' } }),
    },
    {
      name: 'oversized declared body',
      response: new Response('{}', {
        headers: {
          'content-type': 'application/json',
          'content-length': String(1024 * 1024 + 1),
        },
      }),
    },
    {
      name: 'oversized streamed body',
      response: new Response('x'.repeat(1024 * 1024 + 1), {
        headers: { 'content-type': 'application/json' },
      }),
    },
    {
      name: 'invalid JSON',
      response: new Response('{', {
        headers: { 'content-type': 'application/json' },
      }),
    },
  ])('rejects an unsafe upstream response: $name', async ({ response }) => {
    const catalog = new MainFrontendDomainImportCatalog(
      manifestUrl,
      3_000,
      vi.fn().mockResolvedValue(response),
    );
    await expect(catalog.list()).rejects.toThrow();
  });

  it('aborts a stalled upstream request at the configured timeout', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_url, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    }));
    const catalog = new MainFrontendDomainImportCatalog(manifestUrl, 25, fetcher);

    const pending = catalog.list();
    const assertion = expect(pending).rejects.toThrow(/Unable to fetch/);
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });
});
