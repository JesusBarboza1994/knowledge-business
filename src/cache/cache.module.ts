import { Global, Module } from '@nestjs/common'

import { RedisInstanceProvider, BaseRedisProvider, RateLimitRedisProvider } from '@/providers/redis/redis.provider'
import { BaseRedisService } from '@/providers/redis/base-redis.service'
import { RateLimitRedisService } from '@/cache/redis/rate-limit-redis.service'

@Global()
@Module({
  providers: [RedisInstanceProvider, BaseRedisProvider, RateLimitRedisProvider],
  exports: [BaseRedisService, RateLimitRedisService],
})
export class CacheGlobalModule {}
