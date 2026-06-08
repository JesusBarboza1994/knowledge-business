import { Injectable } from '@nestjs/common'

import { BaseRedisService } from '@/providers/redis/base-redis.service'

@Injectable()
export class RateLimitRedisService extends BaseRedisService {
  async zAdd(key: string, score: number, member: string): Promise<number> {
    return this.redis.zadd(key, score, member)
  }

  async zRemRangeByScore(key: string, min: number, max: number): Promise<number> {
    return this.redis.zremrangebyscore(key, min, max)
  }

  async zCard(key: string): Promise<number> {
    return this.redis.zcard(key)
  }
}
