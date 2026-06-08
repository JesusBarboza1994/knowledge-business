import { Injectable, Logger } from '@nestjs/common'
import Redis from 'ioredis'

@Injectable()
export class BaseRedisService {
  private readonly logger = new Logger(BaseRedisService.name)

  constructor(protected readonly redis: Redis) {}

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.redis.set(key, value, 'EX', ttl)
    } else {
      await this.redis.set(key, value)
    }
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key)
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    return this.redis.mget(...keys)
  }

  async keys(pattern: string): Promise<string[]> {
    return this.redis.keys(pattern)
  }

  async del(key: string): Promise<number> {
    return this.redis.del(key)
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.redis.expire(key, seconds)
  }

  async isConnected(): Promise<boolean> {
    try {
      await this.redis.ping()
      return true
    } catch {
      return false
    }
  }
}
