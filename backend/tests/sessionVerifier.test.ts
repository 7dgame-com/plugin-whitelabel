import { describe, expect, it, vi } from 'vitest';
import { buildVerifyTokenUrl, buildWhiteLabelPublicBaseUrl } from '../src/config';
import { MainApiSessionVerifier } from '../src/sessionVerifier';

describe('MainApiSessionVerifier', () => {
  it('retains organization id/name/title and verifies through the fixed upstream', async () => {
    const payload = Buffer.from(JSON.stringify({
      iss: 'https://tenant.acme.example:8443/api',
    })).toString('base64url');
    const token = `e30.${payload}.signature`;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        code: 0,
        data: {
          id: 42,
          roles: ['Admin', 'user'],
          organizations: [
            { id: '12', name: 'Acme', title: 'Acme Academy' },
            { id: 13, name: 'second' },
          ],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const verifier = new MainApiSessionVerifier(
      buildVerifyTokenUrl('https://main.example.test/api'),
      1_000,
      fetchMock,
    );

    const session = await verifier.verify(`Bearer ${token}`);

    expect(session).toEqual({
      userId: '42',
      roles: ['admin', 'user'],
      organizations: [
        { id: 12, name: 'acme', title: 'Acme Academy' },
        { id: 13, name: 'second', title: 'second' },
      ],
    });
    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe(
      'https://main.example.test/api/v1/plugin/verify-token',
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        Host: 'tenant.acme.example:8443',
        'X-Forwarded-Host': 'tenant.acme.example:8443',
        'X-Forwarded-Proto': 'https',
      },
      redirect: 'error',
    });
  });

  it('does not reflect a non-http issuer into upstream headers', async () => {
    const payload = Buffer.from(JSON.stringify({ iss: 'file:///etc/passwd' })).toString('base64url');
    const token = `e30.${payload}.signature`;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: { id: 1, roles: ['root'], organizations: [] },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const verifier = new MainApiSessionVerifier(
      buildVerifyTokenUrl('https://main.example.test'),
      1_000,
      fetchMock,
    );

    await verifier.verify(`Bearer ${token}`);

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    });
  });

  it('fails closed when the main API payload lacks identity', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { roles: ['root'], organizations: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const verifier = new MainApiSessionVerifier(
      buildVerifyTokenUrl('https://main.example.test'),
      1_000,
      fetchMock,
    );
    await expect(verifier.verify('Bearer token')).rejects.toMatchObject({
      status: 502,
      code: 'AUTH_UPSTREAM_ERROR',
    });
  });
});

describe('white-label public base URL', () => {
  it('allows HTTP only outside production and accepts only a pure origin', () => {
    expect(buildWhiteLabelPublicBaseUrl('http://localhost:8093', 'development').toString())
      .toBe('http://localhost:8093/');
    expect(() => buildWhiteLabelPublicBaseUrl(
      'https://whitelabel.example.test/gateway',
      'development',
    ))
      .toThrow(/pure/);
    expect(() => buildWhiteLabelPublicBaseUrl(
      'http://whitelabel.example.test',
      'production',
    )).toThrow(/HTTPS/);
    expect(buildWhiteLabelPublicBaseUrl(
      'https://whitelabel.example.test/',
      'production',
    ).toString()).toBe('https://whitelabel.example.test/');
  });
});
