import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'

import { EXAMPLE_QUEUE } from '../queues.constant'
import { QueueProducer } from './queue.producer'

@Module({
  imports: [
    BullModule.registerQueue({
      name: EXAMPLE_QUEUE,
      streams: {
        events: {
          maxLen: 1000,
        },
      },
    }),
  ],
  providers: [QueueProducer],
  exports: [QueueProducer],
})
export class ProducerQueueModule {}
