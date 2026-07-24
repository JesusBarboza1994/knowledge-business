import { INestApplication } from '@nestjs/common'
import { Express } from 'express'
import { getBrandLogoUrl } from './brand'

export function setupBranding(app: INestApplication, brandLogoUrl = process.env.BRAND_LOGO_URL): void {
  const logoUrl = getBrandLogoUrl(brandLogoUrl)
  const expressApp = app.getHttpAdapter().getInstance() as Express

  expressApp.get('/favicon.ico', (_req, res) => {
    if (!logoUrl) {
      res.sendStatus(404)
      return
    }

    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.redirect(302, logoUrl)
  })
}
