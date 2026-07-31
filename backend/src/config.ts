import { z } from 'zod';

const optionalUrlString = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().url().optional(),
);

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(8093),
    DB_HOST: z.string().trim().min(1),
    DB_PORT: z.coerce.number().int().min(1).max(65_535).default(3306),
    DB_NAME: z.string().trim().min(1),
    DB_USER: z.string().trim().min(1),
    DB_PASSWORD: z.string(),
    DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
    MAIN_API_BASE_URL: z.string().url(),
    MAIN_API_TIMEOUT_MS: z.coerce.number().int().min(250).max(30_000).default(5_000),
    MAIN_FRONTEND_PUBLIC_BASE_URL: optionalUrlString,
    DOMAIN_CATALOG_TIMEOUT_MS: z.coerce.number().int().min(250).max(10_000).default(3_000),
    A1_PUBLIC_BASE_URL: z.string().url(),
    WHITELABEL_INTERNAL_TOKEN: z.string().min(32),
  })
  .passthrough();

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  mysql: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    connectionLimit: number;
  };
  verifyTokenUrl: URL;
  organizationListUrl: URL;
  mainApiTimeoutMs: number;
  domainCatalogManifestUrl: URL | null;
  domainCatalogTimeoutMs: number;
  a1PublicBaseUrl: URL;
  internalApiToken: string;
}

export function buildVerifyTokenUrl(baseUrl: string): URL {
  const parsed = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('MAIN_API_BASE_URL must use http/https and must not contain credentials');
  }
  parsed.search = '';
  parsed.hash = '';
  if (!parsed.pathname.endsWith('/')) {
    parsed.pathname += '/';
  }
  return new URL('v1/plugin/verify-token', parsed);
}

export function buildOrganizationListUrl(baseUrl: string): URL {
  const parsed = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('MAIN_API_BASE_URL must use http/https and must not contain credentials');
  }
  parsed.search = '';
  parsed.hash = '';
  if (!parsed.pathname.endsWith('/')) {
    parsed.pathname += '/';
  }
  return new URL('v1/organization/list', parsed);
}

export function buildA1PublicBaseUrl(
  baseUrl: string,
  nodeEnv: AppConfig['nodeEnv'],
): URL {
  const parsed = new URL(baseUrl);
  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || parsed.pathname !== '/'
  ) {
    throw new Error(
      'A1_PUBLIC_BASE_URL must be a pure http(s) origin without credentials, path, query, or fragment',
    );
  }
  if (nodeEnv === 'production' && parsed.protocol !== 'https:') {
    throw new Error('A1_PUBLIC_BASE_URL must use HTTPS in production');
  }
  if (
    parsed.protocol === 'http:'
    && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  ) {
    throw new Error('Plain HTTP A1_PUBLIC_BASE_URL is allowed only for a loopback host');
  }
  return parsed;
}

export function buildDomainCatalogManifestUrl(
  baseUrl: string,
  nodeEnv: AppConfig['nodeEnv'],
): URL {
  const parsed = new URL(baseUrl);
  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || parsed.pathname !== '/'
  ) {
    throw new Error(
      'MAIN_FRONTEND_PUBLIC_BASE_URL must be a pure http(s) origin without credentials, path, query, or fragment',
    );
  }
  if (nodeEnv === 'production' && parsed.protocol !== 'https:') {
    throw new Error('MAIN_FRONTEND_PUBLIC_BASE_URL must use HTTPS in production');
  }
  return new URL('/config/domains/manifest.json', parsed);
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.parse(environment);
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    mysql: {
      host: parsed.DB_HOST,
      port: parsed.DB_PORT,
      database: parsed.DB_NAME,
      user: parsed.DB_USER,
      password: parsed.DB_PASSWORD,
      connectionLimit: parsed.DB_CONNECTION_LIMIT,
    },
    verifyTokenUrl: buildVerifyTokenUrl(parsed.MAIN_API_BASE_URL),
    organizationListUrl: buildOrganizationListUrl(parsed.MAIN_API_BASE_URL),
    mainApiTimeoutMs: parsed.MAIN_API_TIMEOUT_MS,
    domainCatalogManifestUrl: parsed.MAIN_FRONTEND_PUBLIC_BASE_URL === undefined
      ? null
      : buildDomainCatalogManifestUrl(
        parsed.MAIN_FRONTEND_PUBLIC_BASE_URL,
        parsed.NODE_ENV,
      ),
    domainCatalogTimeoutMs: parsed.DOMAIN_CATALOG_TIMEOUT_MS,
    a1PublicBaseUrl: buildA1PublicBaseUrl(parsed.A1_PUBLIC_BASE_URL, parsed.NODE_ENV),
    internalApiToken: parsed.WHITELABEL_INTERNAL_TOKEN,
  };
}
