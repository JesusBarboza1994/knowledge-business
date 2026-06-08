import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import { DatabaseConfig } from '@/settings/settings.model'

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const db = configService.get<DatabaseConfig>('db')
        return { uri: db?.mongoURI }
      },
      inject: [ConfigService],
    }),
  ],
})
export class MongoModule {}
