import { z } from 'zod';
import type { JsonObject, StaticDomainConfig } from './types';
import {
  domainConfigKeySchema,
  hasLocalDomainConfigData,
  staticDomainConfigSchema,
  staticDomainConfigStructureSchema,
} from './validation';

const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_MANIFEST_DOMAINS = 256;
const MAX_FALLBACK_DEPTH = 8;
const JSON_CONTENT_TYPE = /^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)(?:\s*;|$)/i;

const manifestSummarySchema = z
  .object({
    configKey: domainConfigKeySchema,
    description: z.string().max(191),
    isActive: z.boolean(),
  })
  .passthrough();

const manifestKeySchema = z
  .object({ configKey: domainConfigKeySchema })
  .passthrough();

const manifestEntrySchema = z
  .object({
    configKey: domainConfigKeySchema,
    description: z.string().max(191),
    isActive: z.boolean(),
    config: staticDomainConfigStructureSchema,
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.configKey !== entry.config.name) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['config', 'name'],
        message: 'config.name must exactly match configKey',
      });
    }
    if (entry.description !== entry.config.description) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['description'],
        message: 'description must exactly match config.description',
      });
    }
    if (entry.isActive !== entry.config.is_active) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['isActive'],
        message: 'isActive must exactly match config.is_active',
      });
    }
  });

const manifestEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    domains: z.array(z.unknown()).min(1).max(MAX_MANIFEST_DOMAINS),
  })
  .strict();

type ManifestEntry = z.output<typeof manifestEntrySchema>;
type ManifestSummary = z.output<typeof manifestSummarySchema>;

type ParsedManifestItem =
  | { summary: ManifestSummary; entry: ManifestEntry }
  | { summary: ManifestSummary; reason: string };

export interface DomainImportCatalogItem {
  configKey: string;
  description: string;
  isActive: boolean;
  importable: boolean;
  materializedFrom: string[];
  warnings: string[];
  reason?: string;
  config?: StaticDomainConfig;
}

export interface DomainImportCatalogResult {
  source: string;
  items: DomainImportCatalogItem[];
}

export interface DomainImportCatalog {
  list(): Promise<DomainImportCatalogResult>;
}

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

class DomainCatalogProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainCatalogProtocolError';
  }
}

function unavailableItem(
  entry: ManifestSummary,
  reason: string,
  materializedFrom: string[] = [],
): DomainImportCatalogItem {
  return {
    configKey: entry.configKey,
    description: entry.description,
    isActive: entry.isActive,
    importable: false,
    materializedFrom,
    warnings: [],
    reason,
  };
}

function importableItem(
  entry: ManifestEntry,
  config: StaticDomainConfig,
  materializedFrom: string[] = [],
  warnings: string[] = [],
): DomainImportCatalogItem {
  return {
    configKey: entry.configKey,
    description: entry.description,
    isActive: entry.isActive,
    importable: true,
    materializedFrom,
    warnings,
    config,
  };
}

function materializeEntry(
  entry: ManifestEntry,
  entriesByKey: ReadonlyMap<string, ManifestEntry>,
  unavailableKeys: ReadonlyMap<string, string>,
): DomainImportCatalogItem {
  if (!entry.isActive) {
    return unavailableItem(entry, 'The source domain config is inactive');
  }

  const fallback = entry.config.fallback_domain;
  if (fallback === null) {
    return importableItem(entry, entry.config);
  }
  if (fallback === entry.configKey) {
    return importableItem(entry, entry.config, [], [
      'Self fallback is preserved as metadata and is not resolved at runtime',
    ]);
  }

  const seen = new Set<string>([entry.configKey]);
  const materializedFrom: string[] = [];
  const chain: ManifestEntry[] = [entry];
  let current = entry;

  while (true) {
    const currentFallback = current.config.fallback_domain;
    if (currentFallback === null || currentFallback === current.configKey) {
      break;
    }
    if (seen.has(currentFallback)) {
      return unavailableItem(
        entry,
        `Fallback cycle detected at "${currentFallback}"`,
        [...materializedFrom, currentFallback],
      );
    }
    if (materializedFrom.length >= MAX_FALLBACK_DEPTH) {
      return unavailableItem(
        entry,
        `Fallback chain exceeds the maximum depth of ${MAX_FALLBACK_DEPTH}`,
        materializedFrom,
      );
    }
    materializedFrom.push(currentFallback);
    seen.add(currentFallback);

    const unavailableReason = unavailableKeys.get(currentFallback);
    if (unavailableReason !== undefined) {
      return unavailableItem(
        entry,
        `Fallback config "${currentFallback}" is unavailable: ${unavailableReason}`,
        materializedFrom,
      );
    }

    const target = entriesByKey.get(currentFallback);
    if (!target) {
      return unavailableItem(
        entry,
        `Fallback config "${currentFallback}" is missing from the manifest`,
        materializedFrom,
      );
    }
    if (!target.isActive) {
      return unavailableItem(
        entry,
        `Fallback config "${currentFallback}" is inactive`,
        materializedFrom,
      );
    }
    chain.push(target);
    current = target;
  }

  if (!hasLocalDomainConfigData(current.config)) {
    return unavailableItem(
      entry,
      `Terminal fallback config "${current.configKey}" has no local Unity config data`,
      materializedFrom,
    );
  }

  let defaultConfig: JsonObject = {};
  let localizedConfigs: Record<string, JsonObject> = {};
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const layer = chain[index];
    if (layer === undefined) {
      continue;
    }
    if (Object.keys(layer.config.default_config).length > 0) {
      defaultConfig = structuredClone(layer.config.default_config) as JsonObject;
    }
    const currentLocalizedConfigs: Record<string, JsonObject> = {};
    for (const [locale, localizedConfig] of Object.entries(layer.config.configs)) {
      if (Object.keys(localizedConfig).length > 0) {
        currentLocalizedConfigs[locale] = structuredClone(localizedConfig) as JsonObject;
      }
    }
    localizedConfigs = {
      ...localizedConfigs,
      ...currentLocalizedConfigs,
    };
  }

  const materialized: StaticDomainConfig = {
    ...entry.config,
    default_config: defaultConfig,
    configs: localizedConfigs,
  };
  const validated = staticDomainConfigSchema.safeParse(materialized);
  if (!validated.success) {
    return unavailableItem(
      entry,
      'Materialized fallback config does not satisfy the plugin domain schema',
      materializedFrom,
    );
  }
  return importableItem(entry, validated.data, materializedFrom, [
    'Fallback data was materialized layer by layer from the same manifest; fallback_domain remains metadata only',
  ]);
}

function parseManifest(rawManifest: unknown): {
  items: ParsedManifestItem[];
  entriesByKey: Map<string, ManifestEntry>;
  unavailableKeys: Map<string, string>;
} {
  const envelope = manifestEnvelopeSchema.safeParse(rawManifest);
  if (!envelope.success) {
    throw new DomainCatalogProtocolError('Domain manifest does not match schema version 1');
  }

  const keyOccurrences = new Map<string, number>();
  for (const rawEntry of envelope.data.domains) {
    const keyed = manifestKeySchema.safeParse(rawEntry);
    if (keyed.success) {
      keyOccurrences.set(
        keyed.data.configKey,
        (keyOccurrences.get(keyed.data.configKey) ?? 0) + 1,
      );
    }
  }

  const items: ParsedManifestItem[] = [];
  const entriesByKey = new Map<string, ManifestEntry>();
  const unavailableKeys = new Map<string, string>();
  const reportedDuplicateKeys = new Set<string>();

  for (const rawEntry of envelope.data.domains) {
    const keyed = manifestKeySchema.safeParse(rawEntry);
    const summary = manifestSummarySchema.safeParse(rawEntry);
    if (keyed.success && (keyOccurrences.get(keyed.data.configKey) ?? 0) > 1) {
      const reason = 'The manifest contains duplicate configKey values; no duplicate was selected';
      unavailableKeys.set(keyed.data.configKey, reason);
      if (summary.success && !reportedDuplicateKeys.has(keyed.data.configKey)) {
        items.push({ summary: summary.data, reason });
        reportedDuplicateKeys.add(keyed.data.configKey);
      }
      continue;
    }

    const parsedEntry = manifestEntrySchema.safeParse(rawEntry);
    if (parsedEntry.success) {
      entriesByKey.set(parsedEntry.data.configKey, parsedEntry.data);
      items.push({ summary: parsedEntry.data, entry: parsedEntry.data });
      continue;
    }

    const reason = 'The manifest entry does not satisfy the domain import schema';
    if (keyed.success) {
      unavailableKeys.set(keyed.data.configKey, reason);
    }
    if (summary.success) {
      items.push({ summary: summary.data, reason });
    }
  }

  if (items.length === 0) {
    throw new DomainCatalogProtocolError(
      'Domain manifest contains no recognizable domain entries',
    );
  }

  return { items, entriesByKey, unavailableKeys };
}

async function readBoundedBody(response: Response): Promise<string> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) {
      throw new DomainCatalogProtocolError('Manifest Content-Length is invalid');
    }
    if (Number(declaredLength) > MAX_MANIFEST_BYTES) {
      throw new DomainCatalogProtocolError('Manifest exceeds the response size limit');
    }
  }

  if (!response.body) {
    return '';
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      totalBytes += chunk.value.byteLength;
      if (totalBytes > MAX_MANIFEST_BYTES) {
        await reader.cancel();
        throw new DomainCatalogProtocolError('Manifest exceeds the response size limit');
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes).toString('utf8');
}

export class MainFrontendDomainImportCatalog implements DomainImportCatalog {
  private readonly manifestUrl: URL;

  constructor(
    manifestUrl: URL,
    private readonly timeoutMs: number,
    private readonly fetcher: Fetcher = globalThis.fetch,
  ) {
    this.manifestUrl = new URL(manifestUrl.toString());
  }

  async list(): Promise<DomainImportCatalogResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    timeout.unref();
    try {
      const response = await this.fetcher(this.manifestUrl.toString(), {
        method: 'GET',
        redirect: 'error',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (response.redirected || !response.ok) {
        throw new DomainCatalogProtocolError('Domain manifest returned a non-success status');
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!JSON_CONTENT_TYPE.test(contentType)) {
        throw new DomainCatalogProtocolError('Domain manifest must use a JSON content type');
      }

      const body = await readBoundedBody(response);
      let rawManifest: unknown;
      try {
        rawManifest = JSON.parse(body) as unknown;
      } catch {
        throw new DomainCatalogProtocolError('Domain manifest is not valid JSON');
      }
      const parsed = parseManifest(rawManifest);
      return {
        source: this.manifestUrl.toString(),
        items: parsed.items.map((item) => (
          'entry' in item
            ? materializeEntry(item.entry, parsed.entriesByKey, parsed.unavailableKeys)
            : unavailableItem(item.summary, item.reason)
        )),
      };
    } catch (error) {
      if (error instanceof DomainCatalogProtocolError) {
        throw error;
      }
      throw new DomainCatalogProtocolError('Unable to fetch the domain manifest');
    } finally {
      clearTimeout(timeout);
    }
  }
}
