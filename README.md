# template-mms

> Este repositorio implementa actualmente el backend de Knowledge Hub. La descripción histórica de la plantilla se conserva debajo.

## API web de Knowledge Hub

El frontend usa sesiones firmadas en cookie `httpOnly`. Configuración mínima:

```env
MONGO_URI=mongodb://localhost:27017/knowledge-business
AUTH_TOKEN_SECRET=replace-with-a-long-random-secret
FRONTEND_URL=http://localhost:5173
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
```

Rutas principales:

- `POST /v1/auth/login`, `GET /v1/auth/session`, `POST /v1/auth/logout`
- `GET /v1/knowledge/context`
- `GET|POST /v1/knowledge/notes`
- `GET|PATCH|DELETE /v1/knowledge/notes/:ref`
- `GET /v1/knowledge/notes/:ref/links`
- `GET /v1/knowledge/notes/:ref/versions`
- `GET /v1/users`, `POST /v1/users/invite`, `PATCH /v1/users/:id`

Las rutas privadas también aceptan `Authorization: Bearer <token>` para clientes no navegador. El tenant siempre se obtiene de la identidad firmada, nunca de parámetros enviados por el frontend.

Plantilla base para crear nuevos microservicios en el ecosistema MMS. Incluye toda la infraestructura común: configuración, base de datos, cache Redis, colas BullMQ, guards, interceptores, excepciones y logging.

---

## Requisitos

- Node.js >= 20.18.0
- pnpm >= 9.13.0
- MongoDB
- Redis

---

## Cómo usar esta plantilla

### 1. Copiar el repositorio

Clona o copia esta carpeta con el nombre del nuevo servicio:

```bash
cp -r template-mms mms-nuevo-servicio
cd mms-nuevo-servicio
```

O desde GitHub, usa el botón **"Use this template"** si el repositorio está configurado como template.

### 2. Renombrar el servicio

Actualiza los siguientes valores en `package.json`:

```json
{
  "name": "mms-nuevo-servicio",
  "description": "Descripción del nuevo servicio"
}
```

Actualiza el namespace del logger en `src/commons/constants/logger.constant.ts`:

```ts
export const LOGGER_NAMESPACE = 'MMS-NUEVO-SERVICIO'
```

Actualiza el título de la documentación Swagger en `src/commons/constants/documentation.constant.ts`:

```ts
export const DOCUMENT_TITLE = 'MMS Nuevo Servicio API'
export const DOCUMENT_DESCRIPTION = 'Descripción de la API'
export const DOCUMENT_VERSION = '0.0.1'
```

Actualiza el puerto por defecto en `src/main.ts`:

```ts
const port = process.env.PORT ?? 3000  // cambia al puerto del servicio
```

Reinicializa el repositorio git:

```bash
rm -rf .git
git init
git add .
git commit -m "init: mms-nuevo-servicio from template"
```

### 3. Configurar variables de entorno

Copia `.env.example` a `.env` y completa los valores:

```bash
cp .env.example .env
```

```env
NODE_ENV="dev"
PORT=3000

MONGO_URI=mongodb://localhost:27017/mms-nuevo-servicio

REDIS_URL=
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TTL=300

AUTH_URL=http://localhost:5550
AUTH_API_KEY=your-api-key
```

Agrega las variables específicas del nuevo servicio tanto en `.env` como en `.env.example`.

### 4. Registrar configuraciones adicionales

Si el servicio necesita nuevas variables de entorno, agrégalas en `src/settings/settings.configuration.ts`:

```ts
export default () => ({
  // ... configuración base existente
  miServicio: {
    apiKey: process.env.MI_SERVICIO_API_KEY,
    url: process.env.MI_SERVICIO_URL,
  },
})
```

Y define su interfaz en `src/settings/settings.model.ts`:

```ts
export interface MiServicioConfig {
  apiKey: string
  url: string
}
```

### 5. Instalar dependencias

```bash
pnpm install
pnpm prepare   # inicializa Husky
```

### 6. Levantar en desarrollo

```bash
pnpm dev
```

La API estará disponible en `http://localhost:<PORT>/v1` y la documentación en `http://localhost:<PORT>/docs`.

---

## Estructura del proyecto

```
src/
├── main.ts                          # Bootstrap: puerto, límites de body
├── app.ts                           # Setup global: Swagger, interceptor, ZodValidation
├── app.module.ts                    # Módulo raíz: importa todos los módulos base
│
├── settings/                        # Configuración centralizada de variables de entorno
│   ├── settings.module.ts
│   ├── settings.configuration.ts   # Factory: process.env → objetos tipados
│   └── settings.model.ts           # Interfaces: DatabaseConfig, CacheConfig, AuthConfig...
│
├── commons/
│   ├── constants/                   # Constantes globales compartidas
│   │   ├── response.constant.ts    # Enum ResponseCode
│   │   ├── documentation.constant.ts
│   │   └── logger.constant.ts
│   ├── decorators/
│   │   ├── response-message.decorator.ts  # @ResponseMessage(code, message)
│   │   └── skip-response.decorator.ts     # @SkipResponse() — bypasea el interceptor global
│   ├── exceptions/
│   │   ├── app.exception.ts              # Clase base para todas las excepciones de dominio
│   │   └── auth/
│   │       └── unauthorized.exception.ts
│   ├── guards/
│   │   ├── api-key.guard.ts             # Valida header x-api-key
│   │   ├── authenticated.guard.ts       # Valida Bearer token + store-id
│   │   └── combined-auth.guard.ts       # Acepta api-key O token
│   ├── serializers/
│   │   └── response.serializer.ts       # Interceptor global de respuestas
│   ├── services/
│   │   └── http.service.ts              # Wrapper axios: GET/POST/PUT/DELETE/PATCH
│   └── types/
│       └── response.types.ts            # ResponseSuccess<T>, ErrorResponse
│
├── db/
│   └── models/
│       └── db.module.ts                 # Conexión MongoDB con MongooseModule async
│
├── cache/                               # Módulo Redis sin @nestjs/cache-manager
│   ├── cache.module.ts                  # @Global() — expone BaseRedisService y RateLimitRedisService
│   ├── cache.constant.ts                # RATE_LIMIT_PREFIX, DEFAULT_RATE_LIMIT_MAX/WINDOW
│   └── redis/
│       └── rate-limit-redis.service.ts  # zAdd, zRemRangeByScore, zCard
│
├── queues/                              # Sistema de colas BullMQ
│   ├── queues.constant.ts               # Nombres de queues + enums de jobs
│   ├── queue/
│   │   └── queue.module.ts              # @Global() — configura BullMQ con Redis
│   ├── producers/                       # Publica jobs
│   │   ├── producer-queue.module.ts
│   │   ├── queue.producer.ts            # add() con retry exponencial
│   │   └── dto/
│   │       └── example-job.dto.ts
│   └── consumers/                       # Procesa jobs
│       ├── queue-consumer.module.ts
│       └── example/
│           ├── example-queue.module.ts
│           ├── example-queue.processor.ts  # @Processor + WorkerHost + switch por job
│           └── dto/
│               └── example-job.dto.ts
│
├── providers/
│   ├── logger/
│   │   └── logger.module.ts             # Pino logger con pretty print
│   ├── auth/                            # Cliente del servicio de autenticación externo
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts              # validateToken, validateApiKey
│   │   └── dto/
│   │       └── authenticate.dto.ts
│   └── redis/                           # Providers de ioredis (infraestructura)
│       ├── redis.options.ts             # Opciones de conexión desde CacheConfig
│       ├── base-redis.service.ts        # get/set/del/mget/keys/expire/isConnected
│       └── redis.provider.ts            # RedisInstanceProvider, BaseRedisProvider, RateLimitRedisProvider
│
└── modules/
    └── health/                          # GET /v1/health
        ├── health.module.ts
        └── health.controller.ts
```

---

## Agregar un módulo de feature

### 1. Crear la estructura

```
src/modules/mi-feature/
├── mi-feature.module.ts
├── mi-feature.controller.ts
├── mi-feature.service.ts
├── dto/
│   ├── request/
│   │   └── create-mi-feature.dto.ts
│   └── response/
│       └── mi-feature-response.dto.ts
└── validations/
    └── mi-feature.validation.ts
```

### 2. Controller con respuesta estandarizada

```ts
import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'

import { ResponseMessage } from '@/commons/decorators/response-message.decorator'
import { CombinedAuthGuard } from '@/commons/guards/combined-auth.guard'
import { MiFeatureService } from './mi-feature.service'
import { CreateMiFeatureDto } from './dto/request/create-mi-feature.dto'

@ApiTags('mi-feature')
@ApiBearerAuth()
@Controller('mi-feature')
export class MiFeatureController {
  constructor(private readonly miFeatureService: MiFeatureService) {}

  @Get()
  @UseGuards(CombinedAuthGuard)
  @ResponseMessage('MI_FEATURE_LIST', 'List retrieved successfully')
  findAll() {
    return this.miFeatureService.findAll()
  }

  @Post()
  @UseGuards(CombinedAuthGuard)
  @ResponseMessage('MI_FEATURE_CREATED', 'Created successfully')
  create(@Body() dto: CreateMiFeatureDto) {
    return this.miFeatureService.create(dto)
  }
}
```

### 3. Excepción de dominio

Crea `src/commons/exceptions/mi-feature/mi-feature-not-found.exception.ts`:

```ts
import { HttpStatus } from '@nestjs/common'
import { AppException } from '../app.exception'

export class MiFeatureNotFoundException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.NOT_FOUND, 'MI_FEATURE_NOT_FOUND', 'Mi feature not found', details)
  }
}
```

### 4. Registrar en app.module.ts

```ts
import { MiFeatureModule } from './modules/mi-feature/mi-feature.module'

@Module({
  imports: [
    // ...módulos base
    MiFeatureModule,  // agregar aquí
  ],
})
export class AppModule {}
```

---

## Agregar un modelo de base de datos

Sigue el patrón `db/<entidad>/`:

```
src/db/mi-entidad/
├── mi-entidad-db.module.ts     # MongooseModule.forFeature([{ name, schema }])
├── mi-entidad.schema.ts        # @Schema() con @Prop()
├── mi-entidad.repository.ts    # Métodos de acceso a datos
├── mi-entidad-db.dto.ts        # Tipos internos de la entidad
└── mi-entidad.serializer.ts    # Mapeo de Document → DTO de respuesta
```

---

## Agregar una cola BullMQ

### Producer — para servicios que envían jobs

**1.** Registra la cola en `src/queues/queues.constant.ts`:

```ts
export const MI_QUEUE = 'mi-queue'

export enum MiJobName {
  PROCESS_MI_JOB = 'process-mi-job',
}
```

**2.** Define el DTO en `src/queues/producers/dto/mi-job.dto.ts`.

**3.** Agrega el método en `src/queues/producers/queue.producer.ts`:

```ts
async processMiJob(data: MiJobDto): Promise<void> {
  await this.miQueue.add(MiJobName.PROCESS_MI_JOB, data, this.preConfig)
}
```

**4.** Registra la cola en `src/queues/producers/producer-queue.module.ts`:

```ts
BullModule.registerQueue({ name: MI_QUEUE, streams: { events: { maxLen: 1000 } } })
```

### Consumer — para servicios que procesan jobs

**1.** Crea `src/queues/consumers/mi-feature/mi-feature-queue.processor.ts`:

```ts
@Processor(MI_QUEUE)
export class MiFeatureQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(MiFeatureQueueProcessor.name)

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case MiJobName.PROCESS_MI_JOB:
        await this.handleMiJob(job)
        break
      default:
        throw new Error(`Unknown job name: ${job.name}`)
    }
  }

  private async handleMiJob(job: Job<MiJobDto>): Promise<void> {
    // lógica del job
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.log(`Job ${job.id} completed`)
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error): void {
    this.logger.error(`Job ${job.id} failed: ${error.message}`)
  }
}
```

**2.** Crea su módulo y agrégalo en `src/queues/consumers/queue-consumer.module.ts`.

---

## Usar Redis directamente

`BaseRedisService` y `RateLimitRedisService` son globales y se pueden inyectar en cualquier servicio:

```ts
constructor(private readonly redis: BaseRedisService) {}

// Almacenar con TTL (segundos)
await this.redis.set('clave', 'valor', 300)

// Leer
const valor = await this.redis.get('clave')

// Eliminar
await this.redis.del('clave')

// Verificar conexión
const ok = await this.redis.isConnected()
```

---

## Guards disponibles

| Guard | Headers requeridos | Uso típico |
|---|---|---|
| `ApiKeyGuard` | `x-api-key` | Webhooks, endpoints internos |
| `AuthenticatedGuard` | `authorization: Bearer <token>` + `store-id` | Endpoints de usuario autenticado |
| `CombinedAuthGuard` | `x-api-key` ó `authorization` + `store-id` | Endpoints accesibles por ambos métodos |

---

## Formato de respuesta estándar

**Éxito** — aplica automáticamente a todas las respuestas:
```json
{
  "success": true,
  "code": "MI_CODE",
  "status": 200,
  "message": "Mi mensaje",
  "data": {}
}
```

**Error** — aplica automáticamente cuando se lanza un `AppException`:
```json
{
  "success": false,
  "code": "MI_ERROR_CODE",
  "status": 404,
  "message": "Descripción del error",
  "details": {}
}
```

- Usa `@ResponseMessage(code, message)` en el método del controller para personalizar `code` y `message`.
- Usa `@SkipResponse()` para omitir el interceptor (útil en webhooks o endpoints que retornan respuesta cruda).

---

## Scripts

```bash
pnpm dev          # Modo desarrollo con hot-reload
pnpm build        # Compilar a dist/
pnpm start:prod   # Iniciar servidor desde dist/
pnpm lint         # Verificar código con ESLint
pnpm lint:fix     # Corregir errores de estilo
pnpm format       # Formatear con Prettier
pnpm test         # Tests unitarios
pnpm test:cov     # Tests con reporte de cobertura
pnpm test:ci      # Tests en modo CI (sin watch)
pnpm clean        # Eliminar node_modules, dist, coverage
```

---

## Convenciones

| Qué | Dónde |
|---|---|
| Módulos de negocio | `src/modules/<nombre>/` |
| Integraciones con APIs externas | `src/providers/<nombre>/` |
| Modelos y repositorios MongoDB | `src/db/<entidad>/` |
| Excepciones de dominio | `src/commons/exceptions/<dominio>/` |
| DTOs de entrada y salida | `dto/request/` y `dto/response/` dentro del módulo |
| Schemas de validación Zod | `validations/` dentro del módulo |
| Tests unitarios | Junto al archivo, con sufijo `.test.ts` |
| Constantes de negocio | `src/commons/constants/` |
# knowledge-business
