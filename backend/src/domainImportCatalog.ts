import { z } from 'zod';
import { domainConfigKeySchema } from './validation';

const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_MANIFEST_DOMAINS = 256;
const JSON_CONTENT_TYPE = /^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)(?:\s*;|$)/i;

const manifestSummarySchema = z
  .object({
    configKey: domainConfigKeySchema,
    description: z.string().max(191),
    isActive: z.boolean(),
  })
  .passthrough();

const manifestKeySchema = z.object({ configKey: domainConfigKeySchema }).passthrough();

const manifestEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    domains: z.array(z.unknown()).min(1).max(MAX_MANIFEST_DOMAINS),
  })
  .strict();

export interface DomainImportCatalogItem {
  configKey: string;
  description: string;
  isActive: boolean;
  selectable: boolean;
  reason?: string;
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

function parseManifest(rawManifest: unknown): DomainImportCatalogItem[] {
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

  const items: DomainImportCatalogItem[] = [];
  const reportedKeys = new Set<string>();
  for (const rawEntry of envelope.data.domains) {
    const summary = manifestSummarySchema.safeParse(rawEntry);
    if (!summary.success || reportedKeys.has(summary.data.configKey)) {
      continue;
    }
    reportedKeys.add(summary.data.configKey);
    const duplicate = (keyOccurrences.get(summary.data.configKey) ?? 0) > 1;
    const selectable = summary.data.isActive && !duplicate;
    items.push({
      configKey: summary.data.configKey,
      description: summary.data.description,
      isActive: summary.data.isActive,
      selectable,
      ...(duplicate
        ? { reason: 'The manifest contains duplicate configKey values' }
        : !summary.data.isActive
          ? { reason: 'The main frontend configuration key is inactive' }
          : {}),
    });
  }

  if (items.length === 0) {
    throw new DomainCatalogProtocolError(
      'Domain manifest contains no recognizable domain entries',
    );
  }
  return items;
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

  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
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
      return {
        source: this.manifestUrl.toString(),
        items: parseManifest(rawManifest),
      };
    } catch (error) {
      if (error instanceof DomainCatalogProtocolError) throw error;
      throw new DomainCatalogProtocolError('Unable to fetch the domain manifest');
    } finally {
      clearTimeout(timeout);
    }
  }
}
