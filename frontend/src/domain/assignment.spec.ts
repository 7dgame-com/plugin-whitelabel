import { describe, expect, it } from 'vitest'
import {
  filterAssignmentsForViewer,
  isAssignmentEffective,
} from './assignment'
import type { AssignmentRecord } from './types'

describe('three-layer assignment availability', () => {
  it('is effective only when assignment, organization, and domain are enabled', () => {
    expect(
      isAssignmentEffective({
        enabled: true,
        organizationEnabled: true,
        domainEnabled: true,
      }),
    ).toBe(true)
  })

  it.each([
    [false, true, true],
    [true, false, true],
    [true, true, false],
    [false, false, false],
  ])(
    'fails closed for assignment=%s organization=%s domain=%s',
    (enabled, organizationEnabled, domainEnabled) => {
      expect(
        isAssignmentEffective({
          enabled,
          organizationEnabled,
          domainEnabled,
        }),
      ).toBe(false)
    },
  )

  it('keeps disabled assignments visible to admins in their organization scope', () => {
    const record = (
      assignmentId: number,
      organizationId: number,
      enabled: boolean,
    ): AssignmentRecord => ({
      assignmentId,
      organizationId,
      domainId: 8,
      revision: 1,
      enabled,
      organizationEnabled: true,
      domainEnabled: true,
      qrUrl: null,
      organizationName: '',
      organizationTitle: '',
      domain: '',
      domainDisplayName: '',
    })
    const assignments = [
      record(1, 42, false),
      record(2, 42, true),
      record(3, 99, true),
    ]

    expect(
      filterAssignmentsForViewer(assignments, {
        roles: ['admin'],
        organizations: [{ id: 42 }],
      }).map((assignment) => assignment.assignmentId),
    ).toEqual([1, 2])
  })
})
