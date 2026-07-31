import { describe, expect, it } from 'vitest';
import {
  buildA1PublicBaseUrl,
  buildDomainCatalogManifestUrl,
  loadConfig,
} from '../src/config';

const requiredEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  DB_HOST: 'mysql',
  DB_NAME: 'whitelabel',
  DB_USER: 'whitelabel',
  DB_PASSWORD: 'password',
  MAIN_API_BASE_URL: 'https://api.example.com',
  A1_PUBLIC_BASE_URL: 'https://a1.example.com',
  WHITELABEL_INTERNAL_TOKEN: 'internal-token-that-is-at-least-32-characters',
};

describe('A1 public base URL', () => {
  it('requires HTTPS in production', () => {
    expect(() =>
      buildA1PublicBaseUrl('http://a1.example.com', 'production'),
    ).toThrow(/HTTPS/);
    expect(
      buildA1PublicBaseUrl('https://a1.example.com', 'production').origin,
    ).toBe('https://a1.example.com');
  });

  it('allows plain HTTP only for loopback development origins', () => {
    expect(
      buildA1PublicBaseUrl('http://localhost:8888', 'development').origin,
    ).toBe('http://localhost:8888');
    expect(() =>
      buildA1PublicBaseUrl('http://a1.internal:8888', 'development'),
    ).toThrow(/loopback/);
  });

  it('rejects paths, credentials, queries, and fragments', () => {
    for (const value of [
      'https://user@example.com',
      'https://a1.example.com/base',
      'https://a1.example.com?x=1',
      'https://a1.example.com#fragment',
    ]) {
      expect(() => buildA1PublicBaseUrl(value, 'production')).toThrow();
    }
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

  it('keeps the optional catalog out of startup dependencies when unset', () => {
    const missing = loadConfig({
      ...requiredEnvironment,
      NODE_ENV: 'production',
    });
    expect(missing.domainCatalogManifestUrl).toBeNull();
    expect(missing.domainCatalogTimeoutMs).toBe(3_000);

    const blank = loadConfig({
      ...requiredEnvironment,
      NODE_ENV: 'production',
      MAIN_FRONTEND_PUBLIC_BASE_URL: '',
    });
    expect(blank.domainCatalogManifestUrl).toBeNull();
  });

  it('loads the configured fixed source and bounded timeout', () => {
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
