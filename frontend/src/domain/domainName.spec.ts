import { describe, expect, it } from 'vitest'
import {
  hostnameValidationMessage,
  isExactHostname,
  normalizeHostname,
} from './domainName'

describe('exact hostname validation', () => {
  it('accepts a normalized DNS hostname', () => {
    expect(isExactHostname('ar.school.example.com')).toBe(true)
    expect(hostnameValidationMessage('ar.school.example.com')).toBeNull()
  })

  it.each([
    'https://school.example.com',
    'school.example.com/path',
    'school.example.com:443',
    '*.example.com',
    'school.example.com.',
    'School.example.com',
    'localhost',
    '127.0.0.1',
  ])('rejects non-exact hostname input: %s', (value) => {
    expect(isExactHostname(value)).toBe(false)
  })

  it('normalizes surrounding whitespace and case for the form blur handler', () => {
    expect(normalizeHostname('  School.Example.COM  ')).toBe(
      'school.example.com',
    )
  })
})
