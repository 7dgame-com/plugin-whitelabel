export function isValidWhiteLabelQrUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const parameterNames = [...url.searchParams.keys()]
    const transportAllowed =
      url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    return (
      transportAllowed &&
      url.username === '' &&
      url.password === '' &&
      url.hash === '' &&
      url.pathname === '/v1/white-label-configs' &&
      parameterNames.length === 2 &&
      parameterNames.includes('o') &&
      parameterNames.includes('d') &&
      /^[1-9]\d*$/.test(url.searchParams.get('o') ?? '') &&
      /^[1-9]\d*$/.test(url.searchParams.get('d') ?? '')
    )
  } catch {
    return false
  }
}
