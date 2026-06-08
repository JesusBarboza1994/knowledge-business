import { Module } from '@nestjs/common'

import { ExampleQueueModule } from './example/example-queue.module'

@Module({
  imports: [ExampleQueueModule],
  exports: [ExampleQueueModule],
})
export class QueueConsumerModule {}
