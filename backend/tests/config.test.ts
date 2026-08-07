import { describe, expect, it } from 'vitest';
import {
  buildDomainCatalogManifestUrl,
  buildVerifyTokenUrl,
  loadConfig,
} from '../src/config';

const requiredEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  DB_HOST: 'mysql',
  DB_NAME: 'whitelabel',
  DB_USER: 'whitelabel',
  DB_PASSWORD: 'password',
  MAIN_API_BASE_URL: 'https://api.example.com',
};

describe('main API token verifier URL', () => {
  it('uses only the fixed verify-token route', () => {
    expect(buildVerifyTokenUrl('https://api.example.com/base').toString()).toBe(
      'https://api.example.com/base/v1/plugin/verify-token',
    );
  });

  it('rejects credentials and non-http protocols', () => {
    expect(() => buildVerifyTokenUrl('https://user@example.com')).toThrow();
    expect(() => buildVerifyTokenUrl('file:///tmp/api')).toThrow();
  });
});

describe('main frontend domain catalog URL', () => {
  it('uses one fixed manifest path and requires HTTPS in production', () => {
    expect(buildDomainCatalogManifestUrl(
      'https://d.dev.xrugc.com',
      'production',
    ).toString()).toBe(
      'https://d.dev.xrugc.com/config/domains/manifest.json',
    );
    expect(() => buildDomainCatalogManifestUrl(
      'http://d.dev.xrugc.com',
      'production',
    )).toThrow(/HTTPS/);
    expect(buildDomainCatalogManifestUrl(
      'http://localhost:3001',
      'development',
    ).toString()).toBe(
      'http://localhost:3001/config/domains/manifest.json',
    );
  });

  it('rejects credentials, paths, queries, fragments, and non-http protocols', () => {
    for (const value of [
      'https://user@example.com',
      'https://frontend.example.com/base',
      'https://frontend.example.com?x=1',
      'https://frontend.example.com#fragment',
      'file:///tmp/frontend',
    ]) {
      expect(() => buildDomainCatalogManifestUrl(value, 'development')).toThrow();
    }
  });

  it('has no organization-directory or public-base startup dependency', () => {
    const config = loadConfig({
      ...requiredEnvironment,
      NODE_ENV: 'production',
    });
    expect(config.domainCatalogManifestUrl).toBeNull();
    expect(config.domainCatalogTimeoutMs).toBe(3_000);
    expect(config).not.toHaveProperty('organizationListUrl');
    expect(config).not.toHaveProperty('publicBaseUrl');
  });

  it('loads the optional fixed catalog source and bounded timeout', () => {
    const config = loadConfig({
      ...requiredEnvironment,
      MAIN_FRONTEND_PUBLIC_BASE_URL: 'https://frontend.example.com',
      DOMAIN_CATALOG_TIMEOUT_MS: '10000',
    });
    expect(config.domainCatalogManifestUrl?.toString()).toBe(
      'https://frontend.example.com/config/domains/manifest.json',
    );
    expect(config.domainCatalogTimeoutMs).toBe(10_000);
    expect(() => loadConfig({
      ...requiredEnvironment,
      MAIN_FRONTEND_PUBLIC_BASE_URL: 'https://frontend.example.com',
      DOMAIN_CATALOG_TIMEOUT_MS: '10001',
    })).toThrow();
  });
});
