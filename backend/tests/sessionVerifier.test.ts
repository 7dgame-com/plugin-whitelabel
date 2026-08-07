import { describe, expect, it, vi } from 'vitest';
import { buildVerifyTokenUrl } from '../src/config';
import { MainApiSessionVerifier } from '../src/sessionVerifier';

describe('MainApiSessionVerifier', () => {
  it('retains only identity and roles and verifies through the fixed upstream', async () => {
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

  it('ignores organization context, including malformed organization data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: {
          id: 1,
          roles: ['root'],
          organizations: 'not-used-by-white-label',
        },
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

    await expect(verifier.verify('Bearer token')).resolves.toEqual({
      userId: '1',
      roles: ['root'],
    });
  });
});
