export function domainDescriptionLabel(
  description: string,
  configKey: string,
): string {
  return description.trim() || configKey
}
