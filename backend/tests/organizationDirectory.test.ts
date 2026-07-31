import { describe, expect, it, vi } from 'vitest';
import { buildOrganizationListUrl } from '../src/config';
import { MainApiOrganizationDirectory } from '../src/organizationDirectory';

describe('MainApiOrganizationDirectory', () => {
  it('uses the fixed list URL, same Bearer, and accepts a 255-character title', async () => {
    const payload = Buffer.from(JSON.stringify({
      iss: 'https://tenant.example.test',
    })).toString('base64url');
    const token = `e30.${payload}.signature`;
    const title = 'T'.repeat(255);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        code: 0,
        data: [{ id: 12, name: 'Official-Acme', title }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const directory = new MainApiOrganizationDirectory(
      buildOrganizationListUrl('https://main.example.test/api'),
      1_000,
      fetchMock,
    );

    await expect(directory.findById(`Bearer ${token}`, 12)).resolves.toEqual({
      id: 12,
      name: 'official-acme',
      title,
    });
    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe(
      'https://main.example.test/api/v1/organization/list',
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        Host: 'tenant.example.test',
        'X-Forwarded-Host': 'tenant.example.test',
        'X-Forwarded-Proto': 'https',
      },
      redirect: 'error',
      cache: 'no-store',
    });
  });

  it('returns null only for a valid list without the requested id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 13, name: 'other', title: 'Other' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const directory = new MainApiOrganizationDirectory(
      buildOrganizationListUrl('https://main.example.test'),
      1_000,
      fetchMock,
    );
    await expect(directory.findById('Bearer token', 12)).resolves.toBeNull();
  });

  it('fails closed on network, status, or malformed payload errors', async () => {
    const failingFetch = vi.fn().mockRejectedValue(new Error('network down'));
    const directory = new MainApiOrganizationDirectory(
      buildOrganizationListUrl('https://main.example.test'),
      1_000,
      failingFetch,
    );
    await expect(directory.findById('Bearer token', 12)).rejects.toMatchObject({
      status: 502,
      code: 'ORGANIZATION_DIRECTORY_ERROR',
    });
  });
});
