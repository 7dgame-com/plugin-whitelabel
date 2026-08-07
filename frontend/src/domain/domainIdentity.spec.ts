import { describe, expect, it } from 'vitest'
import { domainDescriptionLabel } from './domainIdentity'

describe('domainDescriptionLabel', () => {
  it('uses the JSON description when it contains visible text', () => {
    expect(domainDescriptionLabel('XR UGC Dev', 'dev.xrugc.com')).toBe(
      'XR UGC Dev',
    )
  })

  it.each(['', '   '])(
    'falls back to the JSON name when description is %j',
    (description) => {
      expect(domainDescriptionLabel(description, 'dev.xrugc.com')).toBe(
        'dev.xrugc.com',
      )
    },
  )
})
