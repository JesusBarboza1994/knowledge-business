import { Global, Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ConfigService } from '@nestjs/config'

import { RedisOptions } from 'ioredis'
import { CacheConfig } from '@/settings/settings.model'

function getRedisOptions(configService: ConfigService): RedisOptions {
  const config = configService.get<CacheConfig>('cache')

  if (config?.url) {
    const parsed = new URL(config.url)
    return {
      host: parsed.hostname,
      port: Number(parsed.port || '6379'),
      password: parsed.password || undefined,
      family: 0,
    }
  }

  return {
    host: config?.host ?? 'localhost',
    port: config?.port ?? 6379,
    password: config?.password || undefined,
    family: 0,
  }
}

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        connection: getRedisOptions(configService),
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
