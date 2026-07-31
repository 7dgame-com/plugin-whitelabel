import { describe, expect, it } from 'vitest';
import { buildA1PublicBaseUrl } from '../src/config';

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
