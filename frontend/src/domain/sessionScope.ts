interface SessionScopeUser {
  id?: number
  username: string
  roles: readonly string[]
  organizations: readonly { id: number }[]
}

export function buildSessionScopeKey(
  user: SessionScopeUser | null,
): string {
  if (!user) return 'signed-out'

  const roles = [...new Set(user.roles)].sort().join(',')
  const organizationIds = user.organizations
    .map((organization) => organization.id)
    .sort((left, right) => left - right)
    .join(',')

  return `${user.id ?? user.username}|${roles}|${organizationIds}`
}
