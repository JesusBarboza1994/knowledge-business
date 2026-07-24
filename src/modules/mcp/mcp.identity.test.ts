import { describe, expect, it } from 'vitest'
import { createMcpServerInfo } from './mcp.identity'

describe('createMcpServerInfo', () => {
  it('includes the configured brand icon', () => {
    expect(createMcpServerInfo('https://knowvault.example.com/knowvault-icon.png')).toMatchObject({
      name: 'knowledge-hub',
      title: 'KnowHub',
      icons: [
        {
          src: 'https://knowvault.example.com/knowvault-icon.png',
          mimeType: 'image/png',
          sizes: ['512x512'],
          theme: 'dark',
        },
      ],
    })
  })

  it('omits icons when BRAND_LOGO_URL is empty', () => {
    expect(createMcpServerInfo('')).not.toHaveProperty('icons')
  })

  it('rejects unsupported URL protocols', () => {
    expect(() => createMcpServerInfo('file:///tmp/knowvault-icon.png')).toThrow('BRAND_LOGO_URL must use http or https')
  })
})
