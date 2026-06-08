import { Provider } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

import { redisOptions } from './redis.options'
import { BaseRedisService } from './base-redis.service'
import { RateLimitRedisService } from '@/cache/redis/rate-limit-redis.service'
import { CacheConfig } from '@/settings/settings.model'

export const REDIS_INSTANCE = Symbol('REDIS_INSTANCE')

export const RedisInstanceProvider: Provider = {
  provide: REDIS_INSTANCE,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): Redis => {
    const config = configService.get<CacheConfig>('cache')

    if (config?.url) {
      return new Redis(config.url)
    }

    return new Redis({
      ...redisOptions(configService),
      family: 0,
    })
  },
}

export const BaseRedisProvider: Provider = {
  provide: BaseRedisService,
  inject: [REDIS_INSTANCE],
  useFactory: (redis: Redis) => new BaseRedisService(redis),
}

export const RateLimitRedisProvider: Provider = {
  provide: RateLimitRedisService,
  inject: [REDIS_INSTANCE],
  useFactory: (redis: Redis) => new RateLimitRedisService(redis),
}
