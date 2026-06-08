import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'

import { EXAMPLE_QUEUE } from '../../queues.constant'
import { ExampleQueueProcessor } from './example-queue.processor'

@Module({
  imports: [
    BullModule.registerQueue({
      name: EXAMPLE_QUEUE,
    }),
  ],
  providers: [ExampleQueueProcessor],
})
export class ExampleQueueModule {}
