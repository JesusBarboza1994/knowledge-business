import { NestFactory, Reflector } from '@nestjs/core'
import { json, urlencoded } from 'express'
import { ZodValidationPipe } from 'nestjs-zod'
import { AppModule } from './app.module'
import { ResponseInterceptor } from './commons/serializers/response.serializer'
import { setupOAuth } from './providers/oauth/oauth.setup'
import { setupMcpEndpoint } from './modules/mcp/mcp.setup'

export async function App() {
  const app = await NestFactory.create(AppModule)

  app.getHttpAdapter().getInstance().set('trust proxy', 1)
  app.use(json({ limit: '25mb' }))
  app.use(urlencoded({ limit: '25mb', extended: true }))

  // OAuth discovery/flow + MCP endpoint live at the Express level, outside the
  // v1 prefix — MCP clients expect them at the URLs advertised in the metadata.
  const issuerUrl = new URL(process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3000}`)
  setupOAuth(app, issuerUrl)
  setupMcpEndpoint(app, issuerUrl)

  app.setGlobalPrefix('v1')
  const allowedOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  app.enableCors({ origin: allowedOrigins, credentials: true })
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)))
  app.useGlobalPipes(new ZodValidationPipe())
  app.enableShutdownHooks()

  return app
}
