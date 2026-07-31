import type { AssignmentRecord } from './types'

interface AssignmentViewer {
  roles: readonly string[]
  organizations: readonly { id: number }[]
}

export function canViewAssignment(
  viewer: AssignmentViewer | null,
  assignment: Pick<AssignmentRecord, 'organizationId'>,
): boolean {
  if (!viewer) return false
  if (viewer.roles.includes('root')) return true
  return (
    viewer.roles.includes('admin') &&
    viewer.organizations.some(
      (organization) => organization.id === assignment.organizationId,
    )
  )
}

export function filterAssignmentsForViewer<T extends AssignmentRecord>(
  assignments: readonly T[],
  viewer: AssignmentViewer | null,
): T[] {
  return assignments.filter((assignment) =>
    canViewAssignment(viewer, assignment),
  )
}

export function isAssignmentEffective(
  assignment: Pick<
    AssignmentRecord,
    'enabled' | 'organizationEnabled' | 'domainEnabled'
  >,
): boolean {
  return (
    assignment.enabled &&
    assignment.organizationEnabled &&
    assignment.domainEnabled
  )
}
