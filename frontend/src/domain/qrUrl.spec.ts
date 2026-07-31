import { describe, expect, it } from 'vitest'
import { isValidWhiteLabelQrUrl } from './qrUrl'

describe('backend-provided A1 QR URL', () => {
  it('accepts the complete HTTPS A1 lookup URL', () => {
    expect(
      isValidWhiteLabelQrUrl(
        'https://a1.example.com/v1/white-label-configs?o=42&d=8',
      ),
    ).toBe(true)
  })

  it('allows plain HTTP only for local loopback development', () => {
    expect(
      isValidWhiteLabelQrUrl(
        'http://localhost:8888/v1/white-label-configs?o=42&d=8',
      ),
    ).toBe(true)
    expect(
      isValidWhiteLabelQrUrl(
        'http://127.0.0.1:8888/v1/white-label-configs?o=42&d=8',
      ),
    ).toBe(true)
  })

  it.each([
    'http://a1.example.com/v1/white-label-configs?o=42&d=8',
    'http://host.docker.internal:8888/v1/white-label-configs?o=42&d=8',
    'https://a1.example.com/v1/white-label-configs?o=42',
    'https://a1.example.com/v1/white-label-configs?o=slug&d=8',
    'https://a1.example.com/v1/white-label-configs?o=0&d=8',
    'https://a1.example.com/v1/white-label-configs?o=42&d=0',
    'https://a1.example.com/other?o=42&d=8',
    'https://a1.example.com/gateway/v1/white-label-configs?o=42&d=8',
    'https://user:password@a1.example.com/v1/white-label-configs?o=42&d=8',
    'https://a1.example.com/v1/white-label-configs?o=42&d=8#fragment',
    'https://a1.example.com/v1/white-label-configs?o=42&d=8&debug=1',
    'https://a1.example.com/v1/white-label-configs?o=42&o=7&d=8',
    'custom://legacy-qr?v=1',
    'not-a-url',
  ])('rejects unsafe or non-contract URL: %s', (value) => {
    expect(isValidWhiteLabelQrUrl(value)).toBe(false)
  })
})
