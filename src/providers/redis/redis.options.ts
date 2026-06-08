import { ConfigService } from '@nestjs/config'
import { RedisOptions } from 'ioredis'

import { CacheConfig } from '@/settings/settings.model'

export const redisOptions = (configService: ConfigService): RedisOptions => {
  const config = configService.get<CacheConfig>('cache')
  return {
    host: config?.host ?? 'localhost',
    port: config?.port ?? 6379,
    password: config?.password,
    family: 0,
  }
}
