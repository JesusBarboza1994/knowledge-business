import type { Implementation } from '@modelcontextprotocol/sdk/types.js'
import { getBrandLogoUrl } from '@/branding/brand'

const BASE_SERVER_INFO: Implementation = {
  name: 'knowledge-hub',
  title: 'KnowHub',
  version: '1.0.0',
  description: 'Memoria confiable y conocimiento conectado para organizaciones.',
}

export function createMcpServerInfo(brandLogoUrl = process.env.BRAND_LOGO_URL): Implementation {
  const iconUrl = getBrandLogoUrl(brandLogoUrl)
  if (!iconUrl) return BASE_SERVER_INFO

  return {
    ...BASE_SERVER_INFO,
    icons: [
      {
        src: iconUrl,
        mimeType: 'image/png',
        sizes: ['512x512'],
        theme: 'dark',
      },
    ],
  }
}
