import { z } from 'zod';
import { unauthorized, upstreamFailure } from './errors';
import type { AuthenticatedSession, SessionVerifier } from './types';

const upstreamPayloadSchema = z
  .object({
    id: z.union([z.number().int().positive(), z.string().regex(/^[1-9][0-9]*$/)]).optional(),
    user_id: z.union([z.number().int().positive(), z.string().regex(/^[1-9][0-9]*$/)]).optional(),
    roles: z.array(z.string()).default([]),
  })
  .passthrough()
  .refine((value) => value.id !== undefined || value.user_id !== undefined, {
    message: 'Missing user id',
  });

function unwrapPayload(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'data' in value) {
    return (value as { data?: unknown }).data;
  }
  return value;
}

function tokenIssuer(authorizationHeader: string): URL | null {
  const token = authorizationHeader.slice('Bearer '.length);
  const encodedPayload = token.split('.')[1];
  if (!encodedPayload) {
    return null;
  }
  try {
    const decoded = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as unknown;
    if (
      !decoded
      || typeof decoded !== 'object'
      || Array.isArray(decoded)
      || !('iss' in decoded)
      || typeof (decoded as { iss?: unknown }).iss !== 'string'
    ) {
      return null;
    }
    const issuer = new URL((decoded as { iss: string }).iss);
    if (
      !['http:', 'https:'].includes(issuer.protocol)
      || !issuer.host
      || issuer.username
      || issuer.password
    ) {
      return null;
    }
    return issuer;
  } catch {
    return null;
  }
}

/**
 * The legacy main API signs JWTs against the issuer host. Only the validated
 * http(s) issuer claim is reflected; no client-supplied Host/Forwarded headers
 * are trusted and the network destination remains the fixed configured URL.
 */
export function buildTokenVerificationHeaders(
  authorizationHeader: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: authorizationHeader,
  };
  const issuer = tokenIssuer(authorizationHeader);
  if (issuer) {
    headers.Host = issuer.host;
    headers['X-Forwarded-Host'] = issuer.host;
    headers['X-Forwarded-Proto'] = issuer.protocol.slice(0, -1);
  }
  return headers;
}

export class MainApiSessionVerifier implements SessionVerifier {
  constructor(
    private readonly verifyTokenUrl: URL,
    private readonly timeoutMs: number,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async verify(authorizationHeader: string): Promise<AuthenticatedSession> {
    let response: Response;
    try {
      response = await this.fetchImplementation(this.verifyTokenUrl, {
        method: 'GET',
        headers: buildTokenVerificationHeaders(authorizationHeader),
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw upstreamFailure();
    }

    if (response.status === 401 || response.status === 403) {
      throw unauthorized('The main-platform token is invalid or expired');
    }
    if (!response.ok) {
      throw upstreamFailure();
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw upstreamFailure();
    }

    const parsed = upstreamPayloadSchema.safeParse(unwrapPayload(body));
    if (!parsed.success) {
      throw upstreamFailure();
    }

    const rawId = parsed.data.user_id ?? parsed.data.id;
    const userId = String(rawId);
    const roles = [...new Set(parsed.data.roles.map((role) => role.trim().toLowerCase()).filter(Boolean))];
    return { userId, roles };
  }
}
