import { Module } from '@nestjs/common'
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino'

import { LOGGER_NAMESPACE, LOGGER_TRANSPORT_OPTION_IGNORE } from '@/commons/constants/logger.constant'

@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        name: LOGGER_NAMESPACE,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: true,
            ignore: LOGGER_TRANSPORT_OPTION_IGNORE,
          },
        },
      },
    }),
  ],
  controllers: [],
  providers: [],
})
export class LoggerModule {}
