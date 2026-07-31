const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/
const IPV4_PATTERN =
  /^(?:\d{1,3}\.){3}\d{1,3}$/

export function normalizeHostname(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * White-label bindings accept a hostname only. Schemes, paths, ports,
 * wildcards, trailing dots and Unicode display names are deliberately rejected.
 */
export function isExactHostname(value: string): boolean {
  const normalized = normalizeHostname(value)
  return (
    normalized === value.trim() &&
    !IPV4_PATTERN.test(normalized) &&
    HOSTNAME_PATTERN.test(normalized)
  )
}

export function hostnameValidationMessage(value: string): string | null {
  if (value.trim() === '') {
    return '请输入域名'
  }

  if (!isExactHostname(value)) {
    return '请输入小写精确 hostname，例如 school.example.com（不要包含协议、端口或路径）'
  }

  return null
}
