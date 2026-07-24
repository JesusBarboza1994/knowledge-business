import { describe, expect, it, vi } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import { setupBranding } from './branding.setup'

describe('setupBranding', () => {
  it('redirects favicon.ico to the configured brand logo', () => {
    const get = vi.fn()
    const app = {
      getHttpAdapter: () => ({ getInstance: () => ({ get }) }),
    } as unknown as INestApplication

    setupBranding(app, 'https://knowvault.example.com/knowvault-icon.png')

    expect(get).toHaveBeenCalledWith('/favicon.ico', expect.any(Function))
    const handler = get.mock.calls[0][1] as (
      request: unknown,
      response: { setHeader: ReturnType<typeof vi.fn>; redirect: ReturnType<typeof vi.fn> },
    ) => void
    const response = { setHeader: vi.fn(), redirect: vi.fn() }

    handler({}, response)

    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=3600')
    expect(response.redirect).toHaveBeenCalledWith(302, 'https://knowvault.example.com/knowvault-icon.png')
  })

  it('returns 404 when no brand logo is configured', () => {
    const get = vi.fn()
    const app = {
      getHttpAdapter: () => ({ getInstance: () => ({ get }) }),
    } as unknown as INestApplication

    setupBranding(app, '')

    const handler = get.mock.calls[0][1] as (
      request: unknown,
      response: { sendStatus: ReturnType<typeof vi.fn> },
    ) => void
    const response = { sendStatus: vi.fn() }

    handler({}, response)

    expect(response.sendStatus).toHaveBeenCalledWith(404)
  })
})
