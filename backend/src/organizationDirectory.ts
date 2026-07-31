import { z } from 'zod';
import { organizationDirectoryFailure } from './errors';
import { buildTokenVerificationHeaders } from './sessionVerifier';
import type { OrganizationDirectory, SessionOrganization } from './types';
import { organizationNameSchema } from './validation';

const organizationSchema = z
  .object({
    id: z.union([
      z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      z.string().regex(/^[1-9][0-9]*$/),
    ]),
    name: z.string().trim().min(1),
    title: z.string().trim().min(1).max(255).optional(),
  })
  .passthrough();

function listPayload(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('data' in value)) {
    return null;
  }
  const data = (value as { data?: unknown }).data;
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === 'object' && !Array.isArray(data) && 'items' in data) {
    const items = (data as { items?: unknown }).items;
    return Array.isArray(items) ? items : null;
  }
  return null;
}

function parseOrganization(value: unknown): SessionOrganization | null {
  const parsed = organizationSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const name = organizationNameSchema.safeParse(parsed.data.name);
  const id = Number(parsed.data.id);
  if (!name.success || !Number.isSafeInteger(id) || id <= 0) {
    return null;
  }
  return {
    id,
    name: name.data,
    title: parsed.data.title?.trim() || name.data,
  };
}

export class MainApiOrganizationDirectory implements OrganizationDirectory {
  constructor(
    private readonly organizationListUrl: URL,
    private readonly timeoutMs: number,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async findById(
    authorizationHeader: string,
    organizationId: number,
  ): Promise<SessionOrganization | null> {
    let response: Response;
    try {
      response = await this.fetchImplementation(this.organizationListUrl, {
        method: 'GET',
        headers: buildTokenVerificationHeaders(authorizationHeader),
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw organizationDirectoryFailure();
    }
    if (!response.ok) {
      throw organizationDirectoryFailure();
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw organizationDirectoryFailure();
    }
    const rawOrganizations = listPayload(body);
    if (!rawOrganizations) {
      throw organizationDirectoryFailure();
    }
    const organizations = rawOrganizations.map(parseOrganization);
    if (organizations.some((organization) => organization === null)) {
      throw organizationDirectoryFailure();
    }
    return organizations.find((organization) => organization?.id === organizationId) ?? null;
  }
}
