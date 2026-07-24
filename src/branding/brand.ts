export function getBrandLogoUrl(value = process.env.BRAND_LOGO_URL): string | undefined {
  const iconUrl = value?.trim()
  if (!iconUrl) return undefined

  const parsedUrl = new URL(iconUrl)
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('BRAND_LOGO_URL must use http or https')
  }

  return parsedUrl.href
}
